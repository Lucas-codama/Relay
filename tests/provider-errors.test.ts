import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderError as classify } from '../src/provider-errors.js';

test('limite de uso, taxa e autenticação mantêm diagnósticos distintos', () => {
  for (const value of ['usageLimitExceeded', 'usage_limit_exceeded', 'UsageLimitExceeded']) {
    assert.deepEqual(classify({ codexErrorInfo: value }), {
      kind: 'access', reason: 'quota', message: 'Limite de uso atingido.', code: 'usage_limit_exceeded',
    });
  }
  assert.equal(classify({ codexErrorInfo: 'rateLimitExceeded' }).reason, 'rate');
  assert.equal(classify({ codexErrorInfo: 'unauthorized' }).reason, 'authentication');
  assert.equal(classify({ codexErrorInfo: 'contextWindowExceeded' }).kind, 'limit');
  assert.equal(classify({ codexErrorInfo: 'sessionBudgetExceeded' }).kind, 'limit');
  assert.equal(classify({ codexErrorInfo: 'cyberPolicy' }).kind, 'scope');
  assert.equal(classify({ codexErrorInfo: 'serverOverloaded' }).kind, 'environment');
});
test('schemas estruturados interpretam somente status HTTP válido no campo correto', () => {
  for (const variant of ['httpConnectionFailed', 'ResponseStreamConnectionFailed', 'response_stream_disconnected', 'responseTooManyFailedAttempts']) {
    for (const [status, reason] of [[401, 'authentication'], [403, 'forbidden'], [429, 'rate'], [503, 'unavailable'], [400, 'invalid-request']] as const) {
      const actual = classify({ error: { code: -32600, data: { codexErrorInfo: { [variant]: { httpStatusCode: status } } } } });
      assert.equal(actual.reason, reason); assert.equal(actual.httpStatus, status);
      assert.ok(actual.code); assert.ok(!actual.message.includes('Limite de uso'));
    }
  }
  for (const value of [null, 0, 99, 600, -401, 401.5, '429', NaN]) {
    assert.deepEqual(classify({ codexErrorInfo: { httpConnectionFailed: { httpStatusCode: value } } }), classify(null));
  }
  assert.equal(classify({ code: 429 }).reason, 'unknown');
  assert.equal(classify({ code: -32600 }).httpStatus, undefined);
  assert.equal(classify({ codexErrorInfo: 'httpConnectionFailed' }).code, undefined);
});
test('texto livre, detalhes e códigos desconhecidos nunca atravessam o diagnóstico', () => {
  const secret = 'CANARY-sk-private https://private.example/?token=CANARY Authorization: Bearer CANARY';
  const values = [secret, null, {}, { message: `quota ${secret}` }, { codexErrorInfo: secret },
    { codexErrorInfo: 'other', message: `usage limit exceeded ${secret}`, additionalDetails: secret },
    { code: secret, data: { body: secret } },
    { codexErrorInfo: { httpConnectionFailed: { httpStatusCode: secret, message: secret } } },
    { codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 429, body: secret } }, additionalDetails: secret }];
  for (const value of values) {
    const output = JSON.stringify(classify(value));
    assert.ok(!output.includes('CANARY')); assert.ok(!output.includes('private.example'));
  }
  assert.equal(classify(values[5]).reason, 'unknown');
});
