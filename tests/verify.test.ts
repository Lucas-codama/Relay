import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier } from '../src/verify.js';
import { cases } from '../src/cases.js';
const good = cases.map(c => ({ id: c.id, ...(c.expected === 'TypeError' ? { kind: 'throw', name: 'TypeError' } : { kind: 'number', value: c.expected }) }));
test('host compara 15 casos; saída parcial não passa', async () => {
  const signal = new AbortController().signal;
  assert.equal((await createVerifier({ run: async () => good }).verify('source', signal)).status, 'passed');
  assert.equal((await createVerifier({ run: async () => good.slice(0, 14) }).verify('source', signal)).failure, 'inconclusive');
  assert.equal((await createVerifier({ run: async () => [...good.slice(1), good[1]] }).verify('source', signal)).failure, 'inconclusive');
  const bad = good.map(c => c.id === 'partial' ? { id: c.id, kind: 'number', value: 200 } : c);
  const result = await createVerifier({ run: async () => bad }).verify('source', signal);
  assert.equal(result.failure, 'implementation'); assert.equal(result.results.filter(c => c.status === 'failed').length, 1);
});
