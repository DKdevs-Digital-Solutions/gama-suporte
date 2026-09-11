import { getConfig } from './config';

// Token da conta de serviço, guardado só em memória do processo (nunca vai pro cliente).
// Sobrevive entre requests no mesmo processo Node do Next (server runtime), mas não entre deploys.
let cachedToken = null;
let loginPromise = null;

export class GsyncApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'GsyncApiError';
    this.status = status;
    this.payload = payload;
  }
}

// A API só devolve JSON de erro quando o Accept pede JSON explicitamente; sem isso, ela
// redireciona (302 -> página HTML) e um `fetch` comum seguiria o redirect silenciosamente.
async function parseJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new GsyncApiError('Resposta inesperada da API Gama/GSync (não-JSON).', res.status || 502, null);
  }
  return res.json();
}

async function login() {
  const config = getConfig();
  const res = await fetch(`${config.gsync.baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login: config.gsync.login, password: config.gsync.password }),
    cache: 'no-store',
  });
  const body = await parseJsonResponse(res);
  if (!res.ok || !body?.data?.token) {
    throw new GsyncApiError('Falha ao autenticar na API Gama/GSync.', res.status, body);
  }
  cachedToken = body.data.token;
  return cachedToken;
}

async function getToken({ forceRefresh = false } = {}) {
  if (cachedToken && !forceRefresh) return cachedToken;
  if (!loginPromise || forceRefresh) {
    loginPromise = login().finally(() => {
      loginPromise = null;
    });
  }
  return loginPromise;
}

function extractMessage(body) {
  // A API mistura "mensagem" (pt) nos erros de regra de negócio e "message" (en) nos erros
  // de autenticação/validação - tratamos as duas chaves defensivamente.
  return body?.mensagem || body?.message || 'Erro inesperado ao consultar a API Gama/GSync.';
}

/**
 * Faz uma chamada autenticada na API do Gama/GSync, com um retry automático
 * caso o token tenha expirado (401) durante o caminho.
 */
async function request(path, { method = 'GET', body, query } = {}, attempt = 0) {
  const config = getConfig();
  const token = await getToken();
  const url = new URL(`${config.gsync.baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = await parseJsonResponse(res);

  if (res.status === 401 && attempt === 0) {
    await getToken({ forceRefresh: true });
    return request(path, { method, body, query }, attempt + 1);
  }

  if (!res.ok || payload?.success === false) {
    throw new GsyncApiError(extractMessage(payload), res.status, payload);
  }

  return payload;
}

export const gsync = {
  identificarPedido: (params) => request('/api/blip/cs/identificar-pedido', { method: 'POST', body: params }),
  ultimasNotas: (params) => request('/api/blip/cs/ultimas-notas', { method: 'POST', body: params }),
  produtos: (params) => request('/api/blip/cs/produtos', { method: 'POST', body: params }),
  assuntos: () => request('/api/blip/cs/assuntos'),
  rcas: () => request('/api/blip/cs/rcas'),
  listarContatos: (params) => request('/api/blip/cs/contatos', { method: 'GET', query: params }),
  criarContato: (params) => request('/api/blip/cs/contatos', { method: 'POST', body: params }),
  abrirChamado: (params) => request('/api/blip/cs/chamados', { method: 'POST', body: params }),
  consultarChamado: (params) => request('/api/blip/cs/chamados/consultar', { method: 'POST', body: params }),
};
