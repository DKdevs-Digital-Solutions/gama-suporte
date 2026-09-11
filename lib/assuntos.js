// Cache local dos assuntos (confirmados via GET /assuntos em 2026-09-11). Evita depender da
// API do Gama/GSync só pra resolver a descrição na hora de gerar um token.
export const ASSUNTOS = {
  36: 'APLICAR DESCONTO',
  28: 'ATRASO DE ENTREGA',
  39: 'BARRAR ENTREGA',
  23: 'DEVOLUÇÃO INTEGRAL',
  44: 'DEVOLUÇÃO NÃO AUTORIZADO',
  35: 'DEVOLUÇÃO PARCIAL',
  30: 'ENVIAR SEGUNDA VIA NF',
  31: 'ENVIO DE BOLETO',
  26: 'EXTRAVIO DE VOLUME',
  43: 'FALTA DE PRODUTO',
  38: 'FALTA DE VOLUME NA ENTREGA',
  27: 'FALTOU MERCADORIA NO PEDIDO',
  37: 'NEGOCIAÇÃO COMERCIAL',
  25: 'OUTRO',
  40: 'PEDIDO CANCELADO',
  32: 'PREÇO ERRADO',
  33: 'PRORROGAR BOLETO ATRASO',
  41: 'RECLAMAÇÃO',
  29: 'RELATÓRIO DE CRÉDITO',
  42: 'RELATÓRIO DIVERGÊNCIAS',
  34: 'SOBRA DE MERCADORIA',
};

const DEFAULT_ID_ASSUNTO = 32; // "PREÇO ERRADO"

/**
 * Aceita id_assunto como número (32), string numérica ("32") ou o texto exato da descrição
 * ("PREÇO ERRADO", case-insensitive). Retorna { id, descricao } ou null se não reconhecer.
 */
export function resolveAssunto(input) {
  if (input === undefined || input === null || input === '') {
    return { id: DEFAULT_ID_ASSUNTO, descricao: ASSUNTOS[DEFAULT_ID_ASSUNTO] };
  }

  const asNumber = Number(input);
  if (!Number.isNaN(asNumber) && ASSUNTOS[asNumber]) {
    return { id: asNumber, descricao: ASSUNTOS[asNumber] };
  }

  const texto = String(input).trim().toUpperCase();
  const found = Object.entries(ASSUNTOS).find(([, descricao]) => descricao === texto);
  if (found) return { id: Number(found[0]), descricao: found[1] };

  return null;
}
