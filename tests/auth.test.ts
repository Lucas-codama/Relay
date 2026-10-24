import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createAuth } from '../src/auth.js';
import { registrationId } from '../src/store.js';
import type { CredentialRecord, SessionStore } from '../src/contracts.js';
import { RelayError } from '../src/errors.js';

const issuer = 'https://auth.openai.com';
const now = Date.now();
const keys = await generateKeyPair('RS256');
const wrongKeys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic', alg: 'RS256', use: 'sig' };
function memoryStore() {
  const values = new Map<string, CredentialRecord>();
  let pending = Promise.resolve();
  const store: SessionStore & { getHostId(): Promise<string> } = {
    getHostId: async () => 'urn:uuid:11111111-1111-1111-1111-111111111111',
    listRegistrations: async () => [...values.keys()].map(id => ({ id, label: `Conta ${id.slice(0, 8)}` })),
    read: async id => values.get(id) ?? null,
    write: async value => { values.set(value.registrationId, structuredClone(value)); },
    async withLock<T>(_id: string, fn: () => Promise<T>) {
      const previous = pending;
      let release!: () => void;
      pending = new Promise<void>(accept => { release = accept; });
      await previous;
      try { return await fn(); } finally { release(); }
    },
  };
  return { store, values };
}
type Scenario = { state?: string; nonce?: string; issuer?: string; audience?: string; expired?: boolean; wrongSignature?: boolean;
  scope?: string; callbackClient?: string; tokenClient?: string; duplicate?: boolean; error?: string; subject?: string };
function harness(scenario: Scenario = {}) {
  const memory = memoryStore();
  let authorization: URL;
  let tokenCalls = 0;
  let refreshes = 0;
  const auth = createAuth({
    now: () => now,
    openBrowser: async url => {
      authorization = url;
      assert.equal(url.origin, issuer);
      if (url.searchParams.get('client_id') === 'dynamic_agent_client') assert.equal(url.searchParams.get('agent_name_hint'), 'Relay');
      else {
        assert.equal(url.searchParams.get('client_id'), 'oaiapp_synthetic');
        assert.equal(url.searchParams.has('agent_name_hint'), false);
      }
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', scenario.state ?? url.searchParams.get('state')!);
      callback.searchParams.set('client_id', scenario.callbackClient ?? 'oaiapp_synthetic');
      if (scenario.error) callback.searchParams.set('error', scenario.error);
      else callback.searchParams.set('code', 'synthetic-code');
      if (scenario.duplicate) callback.searchParams.append('state', 'duplicate');
      const response = await fetch(callback);
      assert.equal(response.status, scenario.state || scenario.duplicate ? 400 : 200);
      // A callback is single-use, including after a rejected first callback.
      assert.equal((await fetch(callback)).status, 404);
    },
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
      assert.equal(url, `${issuer}/api/accounts/oauth/token`);
      tokenCalls++;
      const form = init!.body as URLSearchParams;
      assert.equal(form.get('resource'), 'https://api.openai.com/v1');
      assert.equal(form.get('client_id'), 'oaiapp_synthetic');
      if (form.get('grant_type') === 'refresh_token') {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 20));
        return Response.json({ access_token: 'refreshed-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal(form.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), authorization.searchParams.get('code_challenge'));
      const token = await new SignJWT({ nonce: scenario.nonce ?? authorization.searchParams.get('nonce')! })
        .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' }).setIssuer(scenario.issuer ?? issuer)
        .setAudience(scenario.audience ?? 'oaiapp_synthetic').setSubject(scenario.subject ?? 'subject-one')
        .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + (scenario.expired ? -10 : 3600))
        .sign(scenario.wrongSignature ? wrongKeys.privateKey : keys.privateKey);
      return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', id_token: token,
        token_type: 'Bearer', expires_in: 3600, scope: scenario.scope ?? 'openid offline_access resource.invoke chatgpt.tokens.use.direct',
        ...(scenario.tokenClient ? { client_id: scenario.tokenClient } : {}) });
    },
  });
  return { ...memory, auth, calls: () => ({ tokenCalls, refreshes }) };
}
test('registro público valida PKCE/assinatura/nonce e salva a tripla sem cliente dinâmico', async () => {
  const h = harness();
  const session = await h.auth.ensureSession(h.store, null, new AbortController().signal);
  assert.equal(session.registrationId, registrationId(issuer, 'subject-one', 'oaiapp_synthetic'));
  assert.equal(session.accessToken, 'synthetic-access');
  assert.equal(h.values.size, 1);
});
for (const [name, scenario] of Object.entries({
  state: { state: 'wrong' }, nonce: { nonce: 'wrong' }, issuer: { issuer: 'https://invalid.example' }, audience: { audience: 'other' },
  expiration: { expired: true }, signature: { wrongSignature: true }, scopes: { scope: 'openid' },
  dynamicClient: { callbackClient: 'dynamic_agent_client' }, tokenClient: { tokenClient: 'other' }, duplicate: { duplicate: true },
  consent: { error: 'access_denied' },
})) test(`recusa ${name} e não persiste tokens`, async () => {
  const h = harness(scenario);
  await assert.rejects(h.auth.ensureSession(h.store, null, new AbortController().signal), error =>
    error instanceof RelayError && (error.kind === 'access' || error.kind === 'integrity'));
  assert.equal(h.values.size, 0);
  if (name === 'state' || name === 'duplicate' || name === 'consent' || name === 'dynamicClient') assert.equal(h.calls().tokenCalls, 0);
});
test('duas chamadas renovam uma vez, preservam rotação e não escolhem outra identidade', async () => {
  const h = harness();
  const first = await h.auth.ensureSession(h.store, null, new AbortController().signal);
  h.values.set(first.registrationId, { ...first, expiresAt: now - 1 });
  const other = { ...first, subject: 'second', registrationId: registrationId(issuer, 'second', first.clientId) };
  h.values.set(other.registrationId, other);
  const result = await Promise.all([h.auth.ensureSession(h.store, first.registrationId, new AbortController().signal), h.auth.ensureSession(h.store, first.registrationId, new AbortController().signal)]);
  assert.equal(h.calls().refreshes, 1);
  assert.ok(result.every(item => item.refreshToken === 'rotated-refresh'));
  assert.deepEqual(h.values.get(other.registrationId), other);
});
test('invalid_grant limpa os tokens da conta selecionada e não inicia consentimento automático', async () => {
  const h = harness();
  const first = await h.auth.ensureSession(h.store, null, new AbortController().signal);
  h.values.set(first.registrationId, { ...first, expiresAt: now - 1 });
  let browserCalls = 0;
  const auth = createAuth({ now: () => now, openBrowser: async () => { browserCalls++; },
    fetch: async () => Response.json({ error: 'invalid_grant', error_description: 'synthetic secret must not leak' }, { status: 400 }) });
  await assert.rejects(auth.ensureSession(h.store, first.registrationId, new AbortController().signal), /Sessão expirada/);
  assert.equal(h.values.get(first.registrationId)!.refreshToken, '');
  assert.equal(h.values.get(first.registrationId)!.idToken, '');
  assert.equal(browserCalls, 0);
});
test('cancelamento antes de iniciar não abre navegador nem lê sessão', async () => {
  const h = harness();
  await assert.rejects(h.auth.ensureSession(h.store, null, AbortSignal.abort()), /interrompida/);
  assert.equal(h.calls().tokenCalls, 0);
  assert.equal(h.values.size, 0);
});
test('registro desconhecido não vira troca automática de conta', async () => {
  const h = harness();
  await assert.rejects(h.auth.ensureSession(h.store, 'a'.repeat(64), new AbortController().signal), /Selecione/);
  assert.equal(h.calls().tokenCalls, 0);
});
test('nova autorização do registro preserva cliente/host e recusa outra identidade antes de substituir credenciais', async () => {
  const scenario: Scenario = {};
  const h = harness(scenario);
  const first = await h.auth.ensureSession(h.store, null, new AbortController().signal);
  const signedOut = { ...first, accessToken: '', refreshToken: '', idToken: '', expiresAt: 0, scopes: [] };
  h.values.set(first.registrationId, signedOut);
  scenario.subject = 'different-identity';
  await assert.rejects(h.auth.ensureSession(h.store, first.registrationId, new AbortController().signal), /outra identidade/);
  assert.deepEqual(h.values.get(first.registrationId), signedOut);
  assert.equal(h.values.size, 1);
  scenario.subject = first.subject;
  const restored = await h.auth.ensureSession(h.store, first.registrationId, new AbortController().signal);
  assert.equal(restored.registrationId, first.registrationId);
  assert.equal(restored.hostId, first.hostId);
});
