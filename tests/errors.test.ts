import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAbort, RelayError } from '../src/errors.js';
test('timeout mantém limit; Ctrl+C mantém cancelled', () => {
  const a = new AbortController(); a.abort(new DOMException('timeout', 'TimeoutError'));
  assert.throws(() => checkAbort(a.signal), (e: unknown) => e instanceof RelayError && e.kind === 'limit');
  const b = new AbortController(); b.abort();
  assert.throws(() => checkAbort(b.signal), (e: unknown) => e instanceof RelayError && e.kind === 'cancelled');
});
