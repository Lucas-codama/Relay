import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import type { CredentialRecord, SessionStore } from './contracts.js';
import { RelayError, checkAbort, record, textField } from './errors.js';
import { registrationId } from './store.js';

const issuer = 'https://auth.openai.com';
const authorizeEndpoint = `${issuer}/api/accounts/authorize`;
const tokenEndpoint = `${issuer}/api/accounts/oauth/token`;
const resource = 'https://api.openai.com/v1';
const requiredScope = 'chatgpt.tokens.use.direct';
interface AuthDependencies {
  fetch: typeof globalThis.fetch;
  openBrowser: (url: URL) => Promise<void>;
  now: () => number;
}
function secret(): string { return randomBytes(32).toString('base64url'); }
function equal(a: string, b: string): boolean {
  const first = Buffer.from(a); const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function scopes(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 8192) throw new RelayError('access', 'Escopos de autorização inválidos.');
  const values = [...new Set(value.split(' ').filter(Boolean))];
  if (values.some(value => !/^[a-zA-Z0-9._:/-]+$/.test(value)) || !values.includes(requiredScope))
    throw new RelayError('access', 'O acesso ao plano ChatGPT não foi autorizado.');
  return values;
}
function clientId(value: unknown): string {
  const id = textField(value, 256);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id === 'dynamic_agent_client') throw new RelayError('access', 'Registro de cliente incompleto.');
  return id;
}
async function openBrowser(url: URL): Promise<void> {
  if (url.origin !== issuer || url.pathname !== '/api/accounts/authorize' || process.platform !== 'win32')
    throw new RelayError('environment', 'Este protótipo abre autenticação somente no Windows e na origem oficial.');
  await new Promise<void>((accept, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath ([Console]::In.ReadToEnd()) -WindowStyle Hidden'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new RelayError('environment', 'O navegador não foi iniciado.')); }, 10000);
    child.on('error', () => { clearTimeout(timer); reject(new RelayError('environment', 'O navegador não foi iniciado.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? accept() : reject(new RelayError('environment', 'O navegador não foi iniciado.')); });
    child.stdin.on('error', () => {});
    child.stdin.end(url.href);
  });
}

// Injection is an internal test seam; the CLI never exposes provider/JWKS URL overrides.
export function createAuth(overrides: Partial<AuthDependencies> = {}) {
  const deps: AuthDependencies = { fetch: globalThis.fetch, openBrowser, now: Date.now, ...overrides };
  async function exchange(form: URLSearchParams, signal: AbortSignal): Promise<Record<string, unknown>> {
    checkAbort(signal);
    let response: Response;
    try { response = await deps.fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal, redirect: 'error' }); }
    catch { checkAbort(signal); throw new RelayError('environment', 'Não foi possível consultar a autorização oficial.'); }
    if (Number(response.headers.get('content-length') ?? 0) > 131072) throw new RelayError('access', 'Resposta de autorização inválida.');
    if (!response.body) throw new RelayError('access', 'Resposta de autorização inválida.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        checkAbort(signal);
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 131072) { await reader.cancel(); throw new RelayError('access', 'Resposta de autorização inválida.'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks).toString('utf8');
    let value: Record<string, unknown>;
    try { value = record(JSON.parse(body)); } catch { throw new RelayError('access', 'Resposta de autorização inválida.'); }
    if (!response.ok) {
      if (value.error === 'invalid_grant') throw new RelayError('access', 'invalid_grant');
      throw new RelayError(response.status >= 500 ? 'environment' : 'access', 'A autorização oficial foi recusada.');
    }
    return value;
  }
  async function credentials(value: Record<string, unknown>, id: string, hostId: string, nonce: string | null, previous: CredentialRecord | null, signal: AbortSignal): Promise<CredentialRecord> {
    if (value.client_id !== undefined && value.client_id !== id || value.token_type !== 'Bearer' || typeof value.expires_in !== 'number' ||
        !Number.isSafeInteger(value.expires_in) || value.expires_in <= 0 || value.expires_in > 86400 * 31)
      throw new RelayError('access', 'Metadados de autorização inválidos.');
    const accessToken = textField(value.access_token, 65536);
    const refreshToken = textField(value.refresh_token ?? previous?.refreshToken, 65536);
    const granted = value.scope === undefined && previous ? scopes(previous.scopes.join(' ')) : scopes(value.scope);
    const idToken = textField(value.id_token ?? previous?.idToken, 65536);
    let subject: string;
    if (value.id_token === undefined && previous && nonce === null) subject = previous.subject;
    else {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
        [customFetch]: (url, options) => deps.fetch(url, { ...options, signal, redirect: 'error' }), timeoutDuration: 10000,
      });
      try {
        const { payload } = await jwtVerify(idToken, jwks, {
          issuer, audience: id, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], currentDate: new Date(deps.now()),
        });
        subject = textField(payload.sub, 2048);
        if (nonce !== null && (typeof payload.nonce !== 'string' || !equal(payload.nonce, nonce))) throw new Error('nonce');
        if (payload.azp !== undefined && payload.azp !== id) throw new Error('azp');
        if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== id) throw new Error('azp');
      } catch { checkAbort(signal); throw new RelayError('access', 'A identidade retornada não foi validada.'); }
    }
    if (previous && (subject !== previous.subject || previous.issuer !== issuer || previous.clientId !== id || previous.hostId !== hostId))
      throw new RelayError('integrity', 'A autorização pertence a outra identidade.');
    return { registrationId: registrationId(issuer, subject, id), issuer, subject, clientId: id, hostId, accessToken, refreshToken, idToken,
      expiresAt: deps.now() + value.expires_in * 1000, scopes: granted };
  }
  async function signIn(store: SessionStore, previous: CredentialRecord | null, signal: AbortSignal): Promise<CredentialRecord> {
    const hostGetter = (store as SessionStore & { getHostId?: () => Promise<string> }).getHostId;
    const hostId = previous?.hostId ?? (hostGetter ? await hostGetter.call(store) : null);
    if (!hostId) throw new RelayError('environment', 'O armazenamento não oferece um host ID persistente.');
    const state = secret(); const nonce = secret(); const verifier = secret();
    let consumed = false;
    let resolveCallback!: (params: URLSearchParams) => void;
    let rejectCallback!: (error: Error) => void;
    const callback = new Promise<URLSearchParams>((accept, reject) => { resolveCallback = accept; rejectCallback = reject; });
    // Attach immediately: a callback may fail while the browser launcher is still resolving.
    void callback.catch(() => {});
    const server = createServer((request, response) => {
      let url: URL;
      try { url = new URL(request.url ?? '/', 'http://127.0.0.1'); }
      catch { response.writeHead(400).end(); return; }
      if (request.method !== 'GET' || url.pathname !== '/auth/callback' || consumed) { response.writeHead(404).end(); return; }
      consumed = true;
      const params = url.searchParams;
      const duplicate = [...new Set(params.keys())].some(key => params.getAll(key).length !== 1);
      if (duplicate || !equal(params.get('state') ?? '', state)) {
        response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Autorização recusada.');
        rejectCallback(new RelayError('access', 'O callback de autorização é inválido.')); return;
      }
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" }).end('Retorne ao terminal Relay.');
      resolveCallback(params);
    });
    const abort = () => rejectCallback(new RelayError(signal.reason?.name === 'TimeoutError' ? 'limit' : 'cancelled', 'Autorização interrompida.'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      checkAbort(signal);
      await new Promise<void>((accept, reject) => { server.once('error', () => reject(new RelayError('environment', 'Callback local indisponível.'))); server.listen(0, '127.0.0.1', accept); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new RelayError('environment', 'Callback local indisponível.');
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      const url = new URL(authorizeEndpoint);
      const query: Record<string, string> = { client_id: previous?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: hostId,
        response_type: 'code', redirect_uri: redirect, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource,
        state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
      if (previous) { if (previous.idToken) query.id_token_hint = previous.idToken; }
      else query.agent_name_hint = 'Relay';
      url.search = new URLSearchParams(query).toString();
      await deps.openBrowser(url);
      const params = await callback;
      checkAbort(signal);
      if (params.has('error')) throw new RelayError('access', 'Consentimento ChatGPT recusado.');
      const id = clientId(params.get('client_id') ?? previous?.clientId);
      if (previous && id !== previous.clientId) throw new RelayError('integrity', 'O callback alterou o cliente selecionado.');
      const code = textField(params.get('code'), 8192);
      const value = await exchange(new URLSearchParams({ grant_type: 'authorization_code', client_id: id, code, code_verifier: verifier, redirect_uri: redirect, resource }), signal);
      const result = await credentials(value, id, hostId, nonce, previous, signal);
      checkAbort(signal);
      await store.write(result);
      return result;
    } finally {
      consumed = true;
      signal.removeEventListener('abort', abort);
      server.closeAllConnections();
      await new Promise<void>(accept => server.close(() => accept()));
    }
  }
  return {
    async ensureSession(store: SessionStore, id: string | null, callerSignal: AbortSignal): Promise<CredentialRecord> {
      const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(180000)]);
      checkAbort(signal);
      if (id === null) return signIn(store, null, signal);
      return store.withLock(id, async () => {
        checkAbort(signal);
        const previous = await store.read(id);
        if (!previous) throw new RelayError('access', 'Selecione um registro existente ou inicie novo consentimento.');
        if (previous.issuer !== issuer || registrationId(previous.issuer, previous.subject, previous.clientId) !== id)
          throw new RelayError('integrity', 'Vínculo da sessão inválido.');
        if (!previous.refreshToken) return signIn(store, previous, signal);
        scopes(previous.scopes.join(' '));
        if (previous.expiresAt > deps.now() + 60000 && previous.accessToken) return previous;
        try {
          const value = await exchange(new URLSearchParams({ grant_type: 'refresh_token', client_id: previous.clientId, refresh_token: previous.refreshToken, resource }), signal);
          const result = await credentials(value, previous.clientId, previous.hostId, null, previous, signal);
          checkAbort(signal);
          await store.write(result);
          return result;
        } catch (error) {
          if (error instanceof RelayError && error.message === 'invalid_grant') {
            await store.write({ ...previous, accessToken: '', refreshToken: '', idToken: '', expiresAt: 0, scopes: [] });
            throw new RelayError('access', 'Sessão expirada; autorize novamente o mesmo registro.');
          }
          throw error;
        }
      });
    },
  };
}
export async function ensureSession(store: SessionStore, registration: string | null, signal: AbortSignal): Promise<CredentialRecord> {
  return createAuth().ensureSession(store, registration, signal);
}
