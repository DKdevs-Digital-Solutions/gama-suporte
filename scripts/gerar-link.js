// Helper de linha de comando pra gerar um link de teste sem precisar montar o curl na mão.
// Requer o servidor rodando (npm start) numa outra janela.
//
// Exemplos:
//   node scripts/gerar-link.js --cnpj 12345678000199 --numnota 123456 --min 30
//   node scripts/gerar-link.js --codcli 4521 --numped 987654 --min 15 --assunto 32
require('dotenv').config();

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = process.env.PORT || '3000';
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!internalKey) {
    console.error('INTERNAL_API_KEY não configurada no .env');
    process.exit(1);
  }
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

  const body = {
    expira_em_min: Number(args.min),
    cnpj: args.cnpj,
    codcli: args.codcli ? Number(args.codcli) : undefined,
    numnota: args.numnota ? Number(args.numnota) : undefined,
    numped: args.numped ? Number(args.numped) : undefined,
    id_assunto: args.assunto ? Number(args.assunto) : undefined,
  };

  const res = await fetch(`http://localhost:${port}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': internalKey },
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (!res.ok) {
    console.error('Erro ao gerar link:', json.mensagem || json);
    process.exit(1);
  }

  console.log(`Assunto: ${json.assunto}`);
  console.log(`Expira em: ${json.expira_em}`);
  console.log(`Link: ${json.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
