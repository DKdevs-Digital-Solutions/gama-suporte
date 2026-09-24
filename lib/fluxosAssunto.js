// Define quais etapas o checkout mostra para cada assunto. O mapeamento espelha o que o
// fluxo da Blip coleta hoje em cada caminho do menu "Abrir chamado".
//
// Etapas disponíveis (além de "dados" no início e "revisao" no fim, que são sempre incluídas):
//   produtos_preco  - marca produtos e informa o preço correto de cada um
//   produtos_qt     - marca produtos e informa a quantidade da ocorrência
//   data            - data em que a mercadoria foi recebida
//   credito         - nota de origem, nota de devolução e valor do crédito
//   anexos          - fotos/PDF da ocorrência (até 5, limite da API)
//   descricao       - texto livre
//   contato         - busca do contato por e-mail
const FLUXOS = {
  // PREÇO ERRADO
  32: {
    steps: ['produtos_preco', 'descricao', 'contato'],
    produtos: {
      modo: 'preco',
      titulo: 'Quais produtos vieram com preço errado?',
      ajuda: 'Marque os itens divergentes e informe o preço correto de cada um.',
      rotuloCampo: 'Preço correto (unitário):',
    },
  },

  // DEVOLUÇÃO PARCIAL
  35: {
    steps: ['produtos_qt', 'data', 'anexos', 'descricao', 'contato'],
    produtos: {
      modo: 'quantidade',
      titulo: 'Quais produtos você quer devolver?',
      ajuda: 'Marque os itens e informe quantas unidades serão devolvidas.',
      rotuloCampo: 'Quantidade a devolver:',
    },
  },

  // DEVOLUÇÃO INTEGRAL - sem seleção de itens, a devolução é da nota inteira
  23: {
    steps: ['data', 'anexos', 'descricao', 'contato'],
    aviso: 'A devolução integral considera todos os itens da nota.',
  },

  // FALTA DE PRODUTO
  43: {
    steps: ['produtos_qt', 'data', 'anexos', 'descricao', 'contato'],
    produtos: {
      modo: 'quantidade',
      titulo: 'Quais produtos faltaram na entrega?',
      ajuda: 'Marque os itens e informe quantas unidades faltaram.',
      rotuloCampo: 'Quantidade que faltou:',
    },
  },

  // FALTOU MERCADORIA NO PEDIDO
  27: {
    steps: ['produtos_qt', 'data', 'anexos', 'descricao', 'contato'],
    produtos: {
      modo: 'quantidade',
      titulo: 'Quais produtos faltaram no pedido?',
      ajuda: 'Marque os itens e informe quantas unidades faltaram.',
      rotuloCampo: 'Quantidade que faltou:',
    },
  },

  // SOBRA DE MERCADORIA
  34: {
    steps: ['produtos_qt', 'data', 'anexos', 'descricao', 'contato'],
    produtos: {
      modo: 'quantidade',
      titulo: 'Quais produtos vieram a mais?',
      ajuda: 'Marque os itens e informe quantas unidades vieram além do pedido.',
      rotuloCampo: 'Quantidade excedente:',
    },
  },

  // RELATÓRIO DE CRÉDITO
  29: {
    steps: ['credito', 'descricao', 'contato'],
  },

  // Assuntos que só precisam de descrição
  28: { steps: ['descricao', 'contato'] }, // ATRASO DE ENTREGA
  41: { steps: ['anexos', 'descricao', 'contato'] }, // RECLAMAÇÃO
  33: { steps: ['descricao', 'contato'] }, // PRORROGAR BOLETO ATRASO
  25: { steps: ['anexos', 'descricao', 'contato'] }, // OUTRO
  26: { steps: ['descricao', 'contato'] }, // EXTRAVIO DE VOLUME
  38: { steps: ['descricao', 'contato'] }, // FALTA DE VOLUME NA ENTREGA
  36: { steps: ['descricao', 'contato'] }, // APLICAR DESCONTO
  37: { steps: ['descricao', 'contato'] }, // NEGOCIAÇÃO COMERCIAL
  39: { steps: ['descricao', 'contato'] }, // BARRAR ENTREGA
  40: { steps: ['descricao', 'contato'] }, // PEDIDO CANCELADO
  42: { steps: ['descricao', 'contato'] }, // RELATÓRIO DIVERGÊNCIAS
  44: { steps: ['descricao', 'contato'] }, // DEVOLUÇÃO NÃO AUTORIZADO
  30: { steps: ['descricao', 'contato'] }, // ENVIAR SEGUNDA VIA NF
  31: { steps: ['descricao', 'contato'] }, // ENVIO DE BOLETO
};

// Assunto não mapeado cai aqui: pede só a descrição, que sempre serve.
const FLUXO_PADRAO = { steps: ['descricao', 'contato'] };

const ROTULOS = {
  dados: 'Dados',
  assunto: 'Assunto',
  anexos: 'Anexos',
  produtos_preco: 'Produtos',
  produtos_qt: 'Produtos',
  data: 'Data',
  credito: 'Crédito',
  descricao: 'Descrição',
  contato: 'Contato',
  revisao: 'Revisão',
};

/** Retorna a configuração do assunto, já com as etapas fixas de início e fim. */
export function getFluxo(idAssunto) {
  const base = FLUXOS[Number(idAssunto)] || FLUXO_PADRAO;
  return {
    ...base,
    steps: ['dados', ...base.steps, 'revisao'],
  };
}

export function rotuloEtapa(step) {
  return ROTULOS[step] || step;
}
