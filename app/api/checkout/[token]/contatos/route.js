import { NextResponse } from 'next/server';
import { loadLink, identificacao } from '../../../../../lib/loadLink';
import { gsync } from '../../../../../lib/gsyncClient';
import { withErrorHandling } from '../../../../../lib/apiHandler';

// GET /api/checkout/:token/contatos - lista contatos existentes do cliente.
export const GET = withErrorHandling(async (request, { params }) => {
  const { token } = await params;
  const link = loadLink(token);
  const resultado = await gsync.listarContatos(identificacao(link));
  return NextResponse.json(resultado);
});

// POST /api/checkout/:token/contatos - cadastra um novo contato pra esse cliente.
export const POST = withErrorHandling(async (request, { params }) => {
  const { token } = await params;
  const link = loadLink(token);
  const { nome_contato, celular, email, telefone } = await request.json().catch(() => ({}));
  const resultado = await gsync.criarContato({
    ...identificacao(link),
    nome_contato,
    celular,
    email,
    telefone,
  });
  return NextResponse.json(resultado);
});
