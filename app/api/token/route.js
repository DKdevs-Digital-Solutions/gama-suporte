import { NextResponse } from 'next/server';
import { getConfig } from '../../../lib/config';
import { encodeLinkToken } from '../../../lib/linkToken';
import { resolveAssunto } from '../../../lib/assuntos';
import { withErrorHandling } from '../../../lib/apiHandler';

// POST /api/token - recebe os dados do link e devolve só o token (sem montar a URL, sem
// chamar a API do Gama/GSync). Protegido por X-Internal-Key, igual /api/links.
export const POST = withErrorHandling(async (request) => {
  const config = getConfig();
  const key = request.headers.get('x-internal-key');
  if (key !== config.internalApiKey) {
    return NextResponse.json({ mensagem: 'Chave interna ausente ou inválida.' }, { status: 401 });
  }

  const { expira_em_min, cnpj, codcli, numnota, numped, id_assunto } = await request.json().catch(() => ({}));

  if (!expira_em_min || Number(expira_em_min) <= 0) {
    return NextResponse.json({ mensagem: 'Informe expira_em_min (número de minutos maior que zero).' }, { status: 422 });
  }
  if (!cnpj && !codcli) {
    return NextResponse.json({ mensagem: 'Informe cnpj ou codcli.' }, { status: 422 });
  }
  if (!numnota && !numped) {
    return NextResponse.json({ mensagem: 'Informe numnota ou numped.' }, { status: 422 });
  }

  const assunto = resolveAssunto(id_assunto);
  if (!assunto) {
    return NextResponse.json(
      { mensagem: `Assunto "${id_assunto}" não reconhecido. Use um id_assunto válido ou a descrição exata.` },
      { status: 422 },
    );
  }

  const now = Date.now();
  const exp = now + Number(expira_em_min) * 60_000;

  const token = encodeLinkToken({
    v: 1,
    cnpj: cnpj || undefined,
    codcli: codcli || undefined,
    numnota: numnota || undefined,
    numped: numped || undefined,
    id_assunto: assunto.id,
    assunto_descricao: assunto.descricao,
    iat: now,
    exp,
  });

  return NextResponse.json({
    success: true,
    token,
    expira_em: new Date(exp).toISOString(),
    assunto: assunto.descricao,
  });
});
