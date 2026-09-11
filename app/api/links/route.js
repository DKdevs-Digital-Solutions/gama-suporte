import { NextResponse } from 'next/server';
import { getConfig } from '../../../lib/config';
import { encodeLinkToken } from '../../../lib/linkToken';
import { gsync } from '../../../lib/gsyncClient';
import { withErrorHandling } from '../../../lib/apiHandler';

// POST /api/links - gera o link de checkout que será enviado pelo Blip ao cliente.
// Protegido por X-Internal-Key: só quem tiver essa chave (o fluxo da Blip, ou você via script) pode mintar um link.
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

  const assuntoId = id_assunto ?? 32; // 32 = "PREÇO ERRADO" (teste inicial)
  const { data: assuntos } = await gsync.assuntos();
  const assunto = assuntos.find((a) => a.id === Number(assuntoId));
  if (!assunto) {
    return NextResponse.json({ mensagem: `id_assunto ${assuntoId} não existe em /assuntos.` }, { status: 422 });
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
    assunto_descricao: assunto.descricao_assunto,
    iat: now,
    exp,
  });

  return NextResponse.json({
    success: true,
    url: `${config.publicBaseUrl}/c/${token}`,
    expira_em: new Date(exp).toISOString(),
    assunto: assunto.descricao_assunto,
  });
});
