import { decodeLinkToken } from './linkToken';
import { HttpError } from './httpError';

/** Decodifica o token da URL e garante que o link ainda não expirou. */
export function loadLink(token) {
  let link;
  try {
    link = decodeLinkToken(token);
  } catch {
    throw new HttpError(410, 'Link inválido.');
  }
  if (!link.exp || Date.now() > link.exp) {
    throw new HttpError(410, 'Este link expirou. Peça um novo link de atendimento.');
  }
  return link;
}

/** Extrai só os campos de identificação do cliente/pedido pra reenviar aos endpoints da Gama/GSync. */
export function identificacao(link) {
  const out = {};
  if (link.cnpj) out.cnpj = link.cnpj;
  if (link.codcli) out.codcli = link.codcli;
  if (link.numnota) out.numnota = link.numnota;
  if (link.numped) out.numped = link.numped;
  return out;
}
