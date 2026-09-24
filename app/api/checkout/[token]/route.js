import { NextResponse } from 'next/server';
import { loadLink, identificacao } from '../../../../lib/loadLink';
import { gsync } from '../../../../lib/gsyncClient';
import * as linkStore from '../../../../lib/linkStore';
import { resolveGrupo } from '../../../../lib/assuntos';
import { withErrorHandling } from '../../../../lib/apiHandler';

// GET /api/checkout/:token - dados iniciais pra montar a tela de checkout.
export const GET = withErrorHandling(async (request, { params }) => {
  const { token } = await params;
  const link = loadLink(token);

  const jaUsado = await linkStore.getUsage(token);
  if (jaUsado) {
    return NextResponse.json({
      success: true,
      jaConcluido: true,
      chamado: jaUsado.chamado,
      expira_em: new Date(link.exp).toISOString(),
    });
  }

  const ident = identificacao(link);
  const [pedido, produtos] = await Promise.all([
    gsync.identificarPedido(ident),
    gsync.produtos(ident),
  ]);

  return NextResponse.json({
    success: true,
    jaConcluido: false,
    expira_em: new Date(link.exp).toISOString(),
    assunto: link.id_assunto ? { id: link.id_assunto, descricao: link.assunto_descricao } : null,
    grupo: link.grupo ? resolveGrupo(link.grupo) : null,
    solicitacao_rca: link.solicitacao_rca || null,
    empresa: pedido.data.cliente_descricao,
    cnpj: pedido.data.cnpj,
    numnota: pedido.data.numnota,
    numped: pedido.data.numped,
    data_pedido: pedido.data.data_pedido,
    valor_total: pedido.data.valor_total,
    produtos: produtos.data,
  });
});
