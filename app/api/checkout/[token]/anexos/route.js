import { NextResponse } from 'next/server';
import { loadLink } from '../../../../../lib/loadLink';
import { getConfig } from '../../../../../lib/config';
import { salvarAnexo, tipoAceito, TAMANHO_MAXIMO } from '../../../../../lib/anexoStore';
import { withErrorHandling } from '../../../../../lib/apiHandler';

// POST /api/checkout/:token/anexos - recebe um arquivo do cliente e devolve a URL pública
// que será mandada no campo "anexos" na abertura do chamado.
export const POST = withErrorHandling(async (request, { params }) => {
  const { token } = await params;
  loadLink(token); // valida o link (e a expiração) antes de aceitar qualquer upload

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') {
    return NextResponse.json({ mensagem: 'Nenhum arquivo enviado.' }, { status: 422 });
  }

  if (!tipoAceito(arquivo.type)) {
    return NextResponse.json(
      { mensagem: 'Formato não aceito. Envie uma foto (JPG, PNG, WEBP) ou um PDF.' },
      { status: 422 },
    );
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json(
      { mensagem: 'Arquivo muito grande. O limite é de 10 MB por arquivo.' },
      { status: 422 },
    );
  }

  const bytes = await arquivo.arrayBuffer();
  const id = await salvarAnexo(bytes, arquivo.type);

  return NextResponse.json({
    success: true,
    id,
    url: `${getConfig().publicBaseUrl}/api/anexos/${id}`,
    nome: arquivo.name || 'anexo',
  });
});
