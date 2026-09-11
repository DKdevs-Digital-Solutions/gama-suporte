import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

// Serializa as escritas nesse processo pra evitar corrida entre requests concorrentes.
let writeQueue = Promise.resolve();
function withLock(fn) {
  const result = writeQueue.then(fn);
  writeQueue = result.catch(() => {});
  return result;
}

/** Marca um link (chamado já aberto) como usado, guardando o resultado da abertura. */
export function markUsed(token, chamado) {
  return withLock(() => {
    const store = readStore();
    store[hashToken(token)] = { usedAt: new Date().toISOString(), chamado };
    writeStore(store);
  });
}

/** Retorna o registro de uso do link, se já tiver sido consumido antes. */
export function getUsage(token) {
  const store = readStore();
  return store[hashToken(token)] || null;
}
