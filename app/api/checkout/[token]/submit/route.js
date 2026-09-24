import { NextResponse } from 'next/server';
import { loadLink, identificacao } from '../../../../../lib/loadLink';
import { gsync } from '../../../../../lib/gsyncClient';
import * as linkStore from '../../../../../lib/linkStore';
import { assuntoPermitidoNoGrupo } from '../../../../../lib/assuntos';
import { LIMITE_ANEXOS } from '../../../../../lib/anexoStore';
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

  const { descricao_chamado, produtos, contatos, id_assunto, anexos } = await request.json().catch(() => ({}));

  if (!descricao_chamado || !String(descricao_chamado).trim()) {
    return NextResponse.json({ mensagem: 'Descreva o problema antes de enviar.' }, { status: 422 });
  }
  if (!Array.isArray(contatos) || contatos.length < 1 || contatos.length > 3) {
    return NextResponse.json({ mensagem: 'Selecione de 1 a 3 contatos.' }, { status: 422 });
  }
  if (anexos !== undefined && (!Array.isArray(anexos) || anexos.length > LIMITE_ANEXOS)) {
    return NextResponse.json(
      { mensagem: `É possível anexar no máximo ${LIMITE_ANEXOS} arquivos.` },
      { status: 422 },
    );
  }

  // Link com grupo: o assunto vem da escolha feita no checkout, mas só pode ser um dos
  // permitidos pelo grupo - senão daria pra abrir chamado com qualquer assunto.
  let idAssunto = link.id_assunto;
  if (link.grupo) {
    if (!assuntoPermitidoNoGrupo(link.grupo, id_assunto)) {
      return NextResponse.json({ mensagem: 'Selecione o tipo de atendimento antes de enviar.' }, { status: 422 });
    }
    idAssunto = Number(id_assunto);
  }

  const chamado = await gsync.abrirChamado({
    ...identificacao(link),
    id_assunto: idAssunto,
    descricao_chamado,
    contatos,
    origem: 'BLIP',
    produtos: Array.isArray(produtos) && produtos.length ? produtos : undefined,
    anexos: Array.isArray(anexos) && anexos.length ? anexos : undefined,
    solicitacao_rca: link.solicitacao_rca || undefined,
  });

  await linkStore.markUsed(token, chamado);

  return NextResponse.json({ success: true, jaConcluido: false, chamado });
});
