import crypto from 'crypto';
import { getConfig } from './config';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const key = Buffer.from(getConfig().linkSecret, 'hex');
  if (key.length !== 32) {
    throw new Error('LINK_SECRET precisa ser uma string hex de 32 bytes (64 caracteres).');
  }
  return key;
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, 'base64');
}

/** Criptografa o payload do link (dados do pedido + expiração) num token opaco pra URL. */
export function encodeLinkToken(payload) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return toBase64Url(Buffer.concat([iv, authTag, encrypted]));
}

/** Decodifica e valida o token do link. Lança erro se corrompido, adulterado ou mal formado. */
export function decodeLinkToken(token) {
  const key = getKey();
  const raw = fromBase64Url(String(token || ''));
  if (raw.length < 28) throw new Error('Token de link inválido.');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
