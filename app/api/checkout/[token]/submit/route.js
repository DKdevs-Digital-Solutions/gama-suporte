import { NextResponse } from 'next/server';
import { loadLink, identificacao } from '../../../../../lib/loadLink';
import { gsync } from '../../../../../lib/gsyncClient';
import * as linkStore from '../../../../../lib/linkStore';
import { withErrorHandling } from '../../../../../lib/apiHandler';

// POST /api/checkout/:token/submit - abre o chamado de verdade. Idempotente: se o link já
// tiver sido usado, devolve o chamado já criado em vez de abrir um segundo.
export const POST = withErrorHandling(async (request, { params }) => {
  const { token } = await params;
  const link = loadLink(token);

  const jaUsado = linkStore.getUsage(token);
  if (jaUsado) {
    return NextResponse.json({ success: true, jaConcluido: true, chamado: jaUsado.chamado });
  }

  const { descricao_chamado, produtos, contatos } = await request.json().catch(() => ({}));

  if (!descricao_chamado || !String(descricao_chamado).trim()) {
    return NextResponse.json({ mensagem: 'Descreva o problema antes de enviar.' }, { status: 422 });
  }
  if (!Array.isArray(contatos) || contatos.length < 1 || contatos.length > 3) {
    return NextResponse.json({ mensagem: 'Selecione de 1 a 3 contatos.' }, { status: 422 });
  }

  const chamado = await gsync.abrirChamado({
    ...identificacao(link),
    id_assunto: link.id_assunto,
    descricao_chamado,
    contatos,
    origem: 'BLIP',
    produtos: Array.isArray(produtos) && produtos.length ? produtos : undefined,
  });

  await linkStore.markUsed(token, chamado);

  return NextResponse.json({ success: true, jaConcluido: false, chamado });
});
