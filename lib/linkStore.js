import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getBucket } from './r2';

// Registro de links já usados: garante que um link abre um chamado só uma vez. Precisa sobreviver
// entre requisições, e no Cloudflare Workers não existe disco gravável, então vive no R2 (numa
// pasta separada dos anexos). Em desenvolvimento sem R2 cai no disco.
const PREFIXO_R2 = 'links-usados/';
const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'used-links.json');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Marca um link (chamado já aberto) como usado, guardando o resultado da abertura. */
export async function markUsed(token, chamado) {
  const registro = { usedAt: new Date().toISOString(), chamado };

  const bucket = await getBucket();
  if (bucket) {
    await bucket.put(`${PREFIXO_R2}${hashToken(token)}.json`, JSON.stringify(registro), {
      httpMetadata: { contentType: 'application/json' },
    });
    return;
  }

  const store = readStore();
  store[hashToken(token)] = registro;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

/** Retorna o registro de uso do link, se já tiver sido consumido antes. */
export async function getUsage(token) {
  const bucket = await getBucket();
  if (bucket) {
    const obj = await bucket.get(`${PREFIXO_R2}${hashToken(token)}.json`);
    return obj ? obj.json() : null;
  }
  return readStore()[hashToken(token)] || null;
}
