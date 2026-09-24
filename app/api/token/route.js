import { NextResponse } from 'next/server';
import { getConfig } from '../../../lib/config';
import { encodeLinkToken } from '../../../lib/linkToken';
import { resolveAssunto, resolveGrupo, nomesDeGrupos } from '../../../lib/assuntos';
import { withErrorHandling } from '../../../lib/apiHandler';

// POST /api/token - recebe os dados do link e devolve só o token (sem montar a URL, sem
// chamar a API do Gama/GSync). Protegido por X-Internal-Key, igual /api/links.
export const POST = withErrorHandling(async (request) => {
  const config = getConfig();
  const key = request.headers.get('x-internal-key');
  if (key !== config.internalApiKey) {
    return NextResponse.json({ mensagem: 'Chave interna ausente ou inválida.' }, { status: 401 });
  }

  const {
    expira_em_min, cnpj, codcli, numnota, numped, id_assunto, grupo, solicitacao_rca, whatsapp,
  } = await request.json().catch(() => ({}));

  if (!expira_em_min || Number(expira_em_min) <= 0) {
    return NextResponse.json({ mensagem: 'Informe expira_em_min (número de minutos maior que zero).' }, { status: 422 });
  }
  if (!cnpj && !codcli) {
    return NextResponse.json({ mensagem: 'Informe cnpj ou codcli.' }, { status: 422 });
  }
  if (!numnota && !numped) {
    return NextResponse.json({ mensagem: 'Informe numnota ou numped.' }, { status: 422 });
  }

  // Com "grupo", o próprio checkout pergunta o subtipo (ex: devolução parcial ou integral).
  // Sem ele, o assunto vem fechado no link, como antes.
  const grupoResolvido = grupo ? resolveGrupo(grupo) : null;
  if (grupo && !grupoResolvido) {
    return NextResponse.json(
      { mensagem: `Grupo "${grupo}" não reconhecido. Use um destes: ${nomesDeGrupos().join(', ')}.` },
      { status: 422 },
    );
  }

  const assunto = grupoResolvido ? null : resolveAssunto(id_assunto);
  if (!grupoResolvido && !assunto) {
    return NextResponse.json(
      { mensagem: `Assunto "${id_assunto}" não reconhecido. Use um id_assunto válido ou a descrição exata.` },
      { status: 422 },
    );
  }

  // Código do RCA quando quem pede o chamado é o RCA e não o cliente (campo opcional da API).
  let rca;
  if (solicitacao_rca !== undefined && solicitacao_rca !== null && solicitacao_rca !== '') {
    rca = Number(solicitacao_rca);
    if (!Number.isInteger(rca) || rca <= 0) {
      return NextResponse.json({ mensagem: 'solicitacao_rca deve ser o código numérico do RCA.' }, { status: 422 });
    }
  }

  // Número de quem está falando com o bot. A API não tem campo para ele, então vai no texto do
  // chamado; aceita com ou sem código do país, só dígitos.
  let fone;
  if (whatsapp) {
    fone = String(whatsapp).replace(/\D/g, '');
    if (fone.length < 10 || fone.length > 15) {
      return NextResponse.json({ mensagem: 'whatsapp deve ter DDD e número (10 a 15 dígitos).' }, { status: 422 });
    }
  }

  const now = Date.now();
  const exp = now + Number(expira_em_min) * 60_000;

  const token = encodeLinkToken({
    v: 1,
    cnpj: cnpj || undefined,
    codcli: codcli || undefined,
    numnota: numnota || undefined,
    numped: numped || undefined,
    grupo: grupoResolvido ? grupoResolvido.nome : undefined,
    id_assunto: assunto ? assunto.id : undefined,
    assunto_descricao: assunto ? assunto.descricao : undefined,
    solicitacao_rca: rca,
    whatsapp: fone,
    iat: now,
    exp,
  });

  return NextResponse.json({
    success: true,
    token,
    expira_em: new Date(exp).toISOString(),
    assunto: assunto ? assunto.descricao : undefined,
    grupo: grupoResolvido ? grupoResolvido.nome : undefined,
  });
});
