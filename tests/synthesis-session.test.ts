import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenProvider } from '../src/synthesis-session.js';
import type { CredentialRecord } from '../src/contracts.js';
const record: CredentialRecord = { registrationId: 'same', issuer: 'i', subject: 's', clientId: 'c', hostId: 'h', accessToken: 'old', refreshToken: 'private', idToken: 'id', expiresAt: 100_000, scopes: [] };
test('conversa longa renova antes do próximo turno sem trocar identidade ou renovar token válido', async () => {
  let time = 0, renewals = 0;
  const token = createTokenProvider(record, async registration => { renewals++; assert.equal(registration, 'same'); return { ...record, accessToken: 'new', expiresAt: 300_000 }; }, () => time);
  const signal = new AbortController().signal;
  assert.equal(await token(signal), 'old'); assert.equal(renewals, 0);
  time = 50_000; assert.equal(await token(signal), 'new'); assert.equal(renewals, 1);
  time = 100_000; assert.equal(await token(signal), 'new'); assert.equal(renewals, 1);
});
test('falha de renovação ou identidade diferente não usa token expirado', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(createTokenProvider({ ...record, expiresAt: 0 }, async () => { throw Error('refresh refused'); })(signal), /refresh refused/);
  await assert.rejects(createTokenProvider({ ...record, expiresAt: 0 }, async () => ({ ...record, registrationId: 'other' }))(signal), /outra conta/);
});
