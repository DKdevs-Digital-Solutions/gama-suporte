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

// Grupos de assunto: quando o link é gerado com um grupo em vez de um id fixo, o próprio
// checkout pergunta o subtipo. Espelha as perguntas que o fluxo da Blip faz hoje.
const GRUPOS = {
  devolucao: {
    label: 'DEVOLUÇÃO',
    pergunta: 'A devolução será parcial ou integral?',
    opcoes: [
      { id: 35, titulo: 'Parcial', ajuda: 'Só alguns itens da nota' },
      { id: 23, titulo: 'Integral', ajuda: 'Todos os itens da nota' },
    ],
  },
  falta: {
    label: 'FALTA DE PRODUTO',
    pergunta: 'O que aconteceu com a mercadoria?',
    opcoes: [
      { id: 38, titulo: 'Faltou volume na entrega', ajuda: 'Um volume (caixa) não chegou' },
      { id: 27, titulo: 'Faltou mercadoria no pedido', ajuda: 'O item não veio no pedido' },
      { id: 34, titulo: 'Sobrou mercadoria', ajuda: 'Veio mais do que a nota' },
    ],
  },
  reclamacao: {
    label: 'RECLAMAÇÃO',
    pergunta: 'Qual é o tipo de reclamação?',
    opcoes: [
      { id: 41, titulo: 'Ocorrência na entrega' },
      { id: 33, titulo: 'Prorrogação de boleto' },
      { id: 25, titulo: 'Outro tipo' },
    ],
  },
};

/** Retorna o grupo pelo nome (case-insensitive) ou null. */
export function resolveGrupo(nome) {
  if (!nome) return null;
  const chave = String(nome).trim().toLowerCase();
  const grupo = GRUPOS[chave];
  if (!grupo) return null;
  return {
    nome: chave,
    label: grupo.label,
    pergunta: grupo.pergunta,
    opcoes: grupo.opcoes.map((o) => ({ ...o, descricao: ASSUNTOS[o.id] })),
  };
}

/** Garante que o assunto escolhido no checkout é um dos permitidos pelo grupo do link. */
export function assuntoPermitidoNoGrupo(nomeGrupo, idAssunto) {
  const grupo = resolveGrupo(nomeGrupo);
  if (!grupo) return false;
  return grupo.opcoes.some((o) => o.id === Number(idAssunto));
}

export function nomesDeGrupos() {
  return Object.keys(GRUPOS);
}
