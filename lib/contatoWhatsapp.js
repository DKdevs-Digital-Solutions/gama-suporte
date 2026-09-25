import { gsync } from './gsyncClient';
import { identificacao } from './loadLink';
import { telefoneBR } from './telefone';

/**
 * Garante que o número de WhatsApp que veio no link esteja num contato do cliente e devolve o id
 * desse contato para vincular ao chamado. A API não tem campo de telefone no chamado nem permite
 * editar contato, então: reaproveita um contato que já tenha o número; se nenhum tiver, cadastra
 * um novo com o nome/e-mail do contato escolhido e o WhatsApp no celular.
 * Devolve null quando não dá para cadastrar (ex: contato escolhido sem e-mail).
 */
export async function garantirContatoWhatsapp(link, idContatoEscolhido, api = gsync) {
  const alvo = telefoneBR(link.whatsapp);
  const temONumero = (c) => [c.celular, c.telefone].some((t) => t && telefoneBR(t) === alvo);

  const { data: lista = [] } = await api.listarContatos(identificacao(link));

  const escolhido = lista.find((c) => Number(c.id) === Number(idContatoEscolhido));
  if (escolhido && temONumero(escolhido)) return Number(escolhido.id);

  const existente = lista.find(temONumero);
  if (existente) return Number(existente.id);

  if (!escolhido || !escolhido.email) return null;

  const { contato } = await api.criarContato({
    ...identificacao(link),
    nome_contato: escolhido.nome_contato,
    email: escolhido.email,
    celular: alvo,
  });
  return Number(contato.id);
}
