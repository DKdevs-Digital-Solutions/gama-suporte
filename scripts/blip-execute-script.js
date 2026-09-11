// Cole isso na ação "Execute Script" do Blip Builder.
//
// Gera SÓ o valor codificado (o que vai depois de /c/ na URL) - não monta a URL inteira, não
// chama rede, não depende de nenhuma lib externa. É uma implementação de AES-256-GCM (o mesmo
// algoritmo que o servidor usa) escrita em JavaScript puro, testada byte-a-byte contra o
// resultado do servidor real antes de ir pra cá.
//
// input esperado (objeto, ou uma string JSON com esse formato):
// {
//   "cnpj": "12345678000199",      // OU "codcli": 4521
//   "numnota": 123456,             // OU "numped": 987654
//   "expira_em_min": 30,           // opcional, default 30
//   "id_assunto": 32               // opcional, default 32 = "PREÇO ERRADO"
// }
//
// Saída: só o token (string) - o valor que vai depois de "/c/" na URL do checkout.

const LINK_SECRET_HEX = 'fedaca3856e89514e4acd129ae4962ae29ddcbfb2a2af6dbd9014fa6ee51bf24';

const ASSUNTOS = {
  36: 'APLICAR DESCONTO', 28: 'ATRASO DE ENTREGA', 39: 'BARRAR ENTREGA',
  23: 'DEVOLUÇÃO INTEGRAL', 44: 'DEVOLUÇÃO NÃO AUTORIZADO', 35: 'DEVOLUÇÃO PARCIAL',
  30: 'ENVIAR SEGUNDA VIA NF', 31: 'ENVIO DE BOLETO', 26: 'EXTRAVIO DE VOLUME',
  43: 'FALTA DE PRODUTO', 38: 'FALTA DE VOLUME NA ENTREGA', 27: 'FALTOU MERCADORIA NO PEDIDO',
  37: 'NEGOCIAÇÃO COMERCIAL', 25: 'OUTRO', 40: 'PEDIDO CANCELADO', 32: 'PREÇO ERRADO',
  33: 'PRORROGAR BOLETO ATRASO', 41: 'RECLAMAÇÃO', 29: 'RELATÓRIO DE CRÉDITO',
  42: 'RELATÓRIO DIVERGÊNCIAS', 34: 'SOBRA DE MERCADORIA',
};

// ---------- AES-256 (bloco único, só direção de cifragem - FIPS-197) ----------

const SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];
const RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40];

function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function subWord(w) { return [SBOX[w[0]], SBOX[w[1]], SBOX[w[2]], SBOX[w[3]]]; }
function rotWord(w) { return [w[1], w[2], w[3], w[0]]; }

function keyExpansion(key) {
  const Nk = 8, Nb = 4, Nr = 14;
  const w = [];
  for (let i = 0; i < Nk; i++) w.push([key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]]);
  for (let i = Nk; i < Nb * (Nr + 1); i++) {
    let temp = w[i-1].slice();
    if (i % Nk === 0) {
      temp = subWord(rotWord(temp));
      temp[0] ^= RCON[i / Nk - 1];
    } else if (Nk > 6 && i % Nk === 4) {
      temp = subWord(temp);
    }
    const prev = w[i - Nk];
    w.push([prev[0]^temp[0], prev[1]^temp[1], prev[2]^temp[2], prev[3]^temp[3]]);
  }
  return w;
}

function aesEncryptBlock(input, w) {
  const Nr = 14;
  const state = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for (let i = 0; i < 16; i++) state[Math.floor(i/4)][i%4] = input[i];

  function addRoundKey(round) {
    for (let c = 0; c < 4; c++) {
      const word = w[round*4 + c];
      for (let r = 0; r < 4; r++) state[c][r] ^= word[r];
    }
  }
  function subBytes() { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) state[c][r] = SBOX[state[c][r]]; }
  function shiftRows() {
    for (let r = 1; r < 4; r++) {
      const tmp = [];
      for (let c = 0; c < 4; c++) tmp.push(state[(c+r)%4][r]);
      for (let c = 0; c < 4; c++) state[c][r] = tmp[c];
    }
  }
  function mixColumns() {
    for (let c = 0; c < 4; c++) {
      const a0 = state[c][0], a1 = state[c][1], a2 = state[c][2], a3 = state[c][3];
      state[c][0] = gmul(a0,2) ^ gmul(a1,3) ^ a2 ^ a3;
      state[c][1] = a0 ^ gmul(a1,2) ^ gmul(a2,3) ^ a3;
      state[c][2] = a0 ^ a1 ^ gmul(a2,2) ^ gmul(a3,3);
      state[c][3] = gmul(a0,3) ^ a1 ^ a2 ^ gmul(a3,2);
    }
  }

  addRoundKey(0);
  for (let round = 1; round < Nr; round++) { subBytes(); shiftRows(); mixColumns(); addRoundKey(round); }
  subBytes(); shiftRows(); addRoundKey(Nr);

  const out = new Array(16);
  for (let i = 0; i < 16; i++) out[i] = state[Math.floor(i/4)][i%4];
  return out;
}

// ---------- GCM (modo de operação - NIST SP800-38D, IV de 96 bits, sem AAD) ----------

function xorBlock(a, b) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}
function gfMul128(X, Y) {
  let Z = new Array(16).fill(0);
  let V = Y.slice();
  for (let i = 0; i < 128; i++) {
    const byteIdx = i >> 3, bitIdx = 7 - (i & 7);
    if ((X[byteIdx] >> bitIdx) & 1) Z = xorBlock(Z, V);
    const lsb = V[15] & 1;
    for (let j = 15; j > 0; j--) V[j] = ((V[j] >> 1) | ((V[j-1] & 1) << 7)) & 0xff;
    V[0] = V[0] >> 1;
    if (lsb) V[0] ^= 0xe1;
  }
  return Z;
}
function ghash(H, blocks) {
  let Y = new Array(16).fill(0);
  for (const block of blocks) Y = gfMul128(xorBlock(Y, block), H);
  return Y;
}
function inc32(block) {
  const out = block.slice();
  let carry = 1;
  for (let i = 15; i >= 12 && carry; i--) {
    const sum = out[i] + carry;
    out[i] = sum & 0xff;
    carry = sum > 0xff ? 1 : 0;
  }
  return out;
}
function toBlocks16(bytes) {
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const block = new Array(16).fill(0);
    for (let j = 0; j < 16 && i + j < bytes.length; j++) block[j] = bytes[i + j];
    blocks.push(block);
  }
  return blocks;
}
function u64beBits(nBits) {
  const out = new Array(8).fill(0);
  let big = BigInt(nBits);
  for (let i = 7; i >= 0; i--) { out[i] = Number(big & 0xffn); big >>= 8n; }
  return out;
}

function aes256gcmEncrypt(key, iv, plaintext) {
  const w = keyExpansion(key);
  const zero = new Array(16).fill(0);
  const H = aesEncryptBlock(zero, w);
  const J0 = iv.concat([0, 0, 0, 1]);

  const ciphertext = new Array(plaintext.length);
  let counter = J0;
  for (let i = 0; i < plaintext.length; i += 16) {
    counter = inc32(counter);
    const keystream = aesEncryptBlock(counter, w);
    for (let j = 0; j < 16 && i + j < plaintext.length; j++) ciphertext[i + j] = plaintext[i + j] ^ keystream[j];
  }

  const lenBlock = u64beBits(0).concat(u64beBits(plaintext.length * 8));
  const S = ghash(H, toBlocks16(ciphertext).concat([lenBlock]));
  const tag = xorBlock(aesEncryptBlock(J0, w), S);

  return { ciphertext, tag };
}

// ---------- Utilitários (UTF-8, base64url, hex) - sem Buffer, sem libs ----------

function utf8Encode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i);
    if (code > 0xffff) i++;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
}

const B64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(bytes) {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i+1] << 8) | bytes[i+2];
    out += B64URL_CHARS[(n >> 18) & 0x3f] + B64URL_CHARS[(n >> 12) & 0x3f] + B64URL_CHARS[(n >> 6) & 0x3f] + B64URL_CHARS[n & 0x3f];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64URL_CHARS[(n >> 18) & 0x3f] + B64URL_CHARS[(n >> 12) & 0x3f];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i+1] << 8);
    out += B64URL_CHARS[(n >> 18) & 0x3f] + B64URL_CHARS[(n >> 12) & 0x3f] + B64URL_CHARS[(n >> 6) & 0x3f];
  }
  return out;
}

function hexToBytes(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
  return out;
}

function randomBytes(n) {
  // Usa crypto.getRandomValues quando disponível (recomendado); Math.random() é o
  // fallback caso o sandbox de script da Blip não exponha nenhuma API de crypto.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return Array.from(arr);
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

// ---------- Ponto de entrada exigido pela Blip ----------

function run(input) {
  const dados = typeof input === 'string' ? JSON.parse(input) : (input || {});

  const assuntoId = dados.id_assunto || 32; // 32 = "PREÇO ERRADO"
  const assuntoDescricao = dados.assunto_descricao || ASSUNTOS[assuntoId];
  if (!assuntoDescricao) throw new Error('id_assunto desconhecido: informe assunto_descricao.');

  const now = Date.now();
  const payload = {
    v: 1,
    id_assunto: assuntoId,
    assunto_descricao: assuntoDescricao,
    iat: now,
    exp: now + (dados.expira_em_min || 30) * 60000,
  };
  if (dados.cnpj) payload.cnpj = String(dados.cnpj);
  if (dados.codcli) payload.codcli = Number(dados.codcli);
  if (dados.numnota) payload.numnota = Number(dados.numnota);
  if (dados.numped) payload.numped = Number(dados.numped);

  const key = hexToBytes(LINK_SECRET_HEX);
  const iv = randomBytes(12);
  const plaintext = utf8Encode(JSON.stringify(payload));
  const { ciphertext, tag } = aes256gcmEncrypt(key, iv, plaintext);

  return base64UrlEncode(iv.concat(tag, ciphertext));
}
