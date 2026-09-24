import { lerAnexo } from '../../../../lib/anexoStore';

// GET /api/anexos/:id - serve o arquivo enviado no checkout. É esta URL que vai no campo
// "anexos" do chamado: o Gsync baixa o conteúdo daqui na hora da abertura. Sem autenticação
// por isso mesmo - o que protege é o id ser aleatório.
export async function GET(request, { params }) {
  const { id } = await params;
  const anexo = await lerAnexo(id);

  if (!anexo) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  return new Response(anexo.bytes, {
    status: 200,
    headers: {
      'Content-Type': anexo.contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
