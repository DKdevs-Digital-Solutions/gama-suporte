// Loader mínimo de .env pros scripts de linha de comando (o Next carrega o .env sozinho pro
// app, mas scripts avulsos rodados com "node scripts/x.js" não passam pelo Next).
const fs = require('fs');
const path = require('path');

function loadEnv(envPath = path.join(__dirname, '..', '..', '.env')) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

module.exports = { loadEnv };
