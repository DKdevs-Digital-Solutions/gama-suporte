// Gera o token codificado (e a URL completa) direto, sem precisar do servidor rodando nem
// bater na API do Gama/GSync - só precisa do LINK_SECRET do .env. Útil quando você já sabe
// o id_assunto e quer o valor codificado na hora, sem round-trip de rede.
//
// Exemplos:
//   node scripts/gerar-token.js --cnpj 12345678000199 --numnota 123456 --min 30
//   node scripts/gerar-token.js --codcli 4521 --numped 987654 --min 15 --assunto 32
require('./lib/loadEnv').loadEnv();
const crypto = require('crypto');

// Mesma lógica de lib/linkToken.js, duplicada aqui pra evitar a dor de importar um módulo
// ES module (usado pelo Next) de dentro de um script CommonJS simples.
const ALGORITHM = 'aes-256-gcm';

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeLinkToken(payload) {
  const key = Buffer.from(process.env.LINK_SECRET || '', 'hex');
  if (key.length !== 32) {
    throw new Error('LINK_SECRET ausente ou inválido no .env (precisa ser hex de 64 caracteres).');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return toBase64Url(Buffer.concat([iv, authTag, encrypted]));
}

// Cache local dos assuntos (confirmados via GET /assuntos em 2026-09-11) - evita precisar
// de rede só pra saber a descrição. Se a lista mudar no Gama/GSync, use --assunto-desc pra
// sobrescrever, ou rode "node scripts/gerar-link.js" (que consulta a API ao vivo) em vez deste.
const ASSUNTOS = {
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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? next : true;
      if (out[key] !== true) i += 1;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.min) {
    console.error('Use --min <minutos> pra definir a expiração do link.');
    process.exit(1);
  }
  if (!args.cnpj && !args.codcli) {
    console.error('Use --cnpj <cnpj> ou --codcli <codigo>.');
    process.exit(1);
  }
  if (!args.numnota && !args.numped) {
    console.error('Use --numnota <numero> ou --numped <numero>.');
    process.exit(1);
  }

  const assuntoId = args.assunto ? Number(args.assunto) : 32; // 32 = "PREÇO ERRADO"
  const assuntoDescricao = args['assunto-desc'] || ASSUNTOS[assuntoId];
  if (!assuntoDescricao) {
    console.error(`Não conheço a descrição do id_assunto ${assuntoId}. Informe com --assunto-desc "TEXTO".`);
    process.exit(1);
  }

  const now = Date.now();
  const exp = now + Number(args.min) * 60_000;

  const token = encodeLinkToken({
    v: 1,
    cnpj: args.cnpj || undefined,
    codcli: args.codcli ? Number(args.codcli) : undefined,
    numnota: args.numnota ? Number(args.numnota) : undefined,
    numped: args.numped ? Number(args.numped) : undefined,
    id_assunto: assuntoId,
    assunto_descricao: assuntoDescricao,
    iat: now,
    exp,
  });

  const base = (process.env.PUBLIC_BASE_URL || 'https://SEU-DOMINIO.workers.dev').replace(/\/+$/, '');

  console.log(`Assunto: ${assuntoDescricao}`);
  console.log(`Expira em: ${new Date(exp).toISOString()}`);
  console.log(`Token: ${token}`);
  console.log(`URL completa: ${base}/c/${token}`);
}

main();
