import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getBucket } from './r2';

// A API do Gama/GSync não recebe upload: ela recebe URLs e baixa o conteúdo na hora de abrir
// o chamado. Então os arquivos que o cliente manda no checkout precisam ficar acessíveis numa
// URL nossa. Em produção (Cloudflare Workers) isso vive num bucket R2; em desenvolvimento cai
// no disco, já que não existe R2 rodando local.
const DATA_DIR = path.join(process.cwd(), 'data', 'anexos');

export const LIMITE_ANEXOS = 5; // a API aceita no máximo 5
export const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB por arquivo

const TIPOS_ACEITOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function tipoAceito(contentType) {
  return Object.prototype.hasOwnProperty.call(TIPOS_ACEITOS, String(contentType || '').toLowerCase());
}

export function extensaoDoTipo(contentType) {
  return TIPOS_ACEITOS[String(contentType || '').toLowerCase()] || 'bin';
}

/**
 * Guarda o arquivo e devolve o id pra montar a URL pública. O id é aleatório, então a URL
 * não é adivinhável - mesma ideia dos links assinados que a Blip manda hoje.
 */
export async function salvarAnexo(bytes, contentType) {
  const id = `${crypto.randomBytes(16).toString('hex')}.${extensaoDoTipo(contentType)}`;

  const bucket = await getBucket();
  if (bucket) {
    await bucket.put(id, bytes, { httpMetadata: { contentType } });
    return id;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, id), Buffer.from(bytes));
  fs.writeFileSync(path.join(DATA_DIR, `${id}.tipo`), contentType);
  return id;
}

/** Devolve { bytes, contentType } ou null se não existir. */
export async function lerAnexo(id) {
  if (!/^[0-9a-f]{32}\.[a-z0-9]{2,5}$/.test(String(id))) return null;

  const bucket = await getBucket();
  if (bucket) {
    const obj = await bucket.get(id);
    if (!obj) return null;
    return {
      bytes: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
    };
  }

  try {
    const bytes = fs.readFileSync(path.join(DATA_DIR, id));
    let contentType = 'application/octet-stream';
    try {
      contentType = fs.readFileSync(path.join(DATA_DIR, `${id}.tipo`), 'utf8');
    } catch { /* sem o arquivo de tipo, devolve genérico */ }
    return { bytes, contentType };
  } catch {
    return null;
  }
}
