import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/policy.js';
import type { AttemptResult, FailureKind } from '../src/contracts.js';
const attempt = (failure: FailureKind | null, profile = 'economico'): AttemptResult => ({
  localId: 'test', versions: { relay: '0', node: '24', codex: 'test' }, durationMs: 1,
  profile: profile as 'economico' | 'robusto', status: failure ? 'failed' : 'passed',
  failure, diagnostic: '', threadId: null, turnId: null, requested: { model: 'a', effort: 'low' },
  observedModel: null, usage: { input: null, cachedInput: null, output: null, reasoningOutput: null, total: null },
  verification: null, diffArtifact: null,
});
test('seleção, sucesso e escalada única', () => {
  assert.deepEqual(decide([], 10), { action: 'run', profile: 'economico' });
  assert.deepEqual(decide([attempt(null)], 10), { action: 'complete' });
  assert.deepEqual(decide([attempt('implementation')], 10), { action: 'run', profile: 'robusto' });
  assert.deepEqual(decide([attempt('implementation'), attempt('implementation', 'robusto')], 10), { action: 'stop', reason: 'implementation' });
});
test('falhas não funcionais e tempo não geram outra inferência', () => {
  for (const kind of ['access', 'environment', 'scope', 'integrity', 'inconclusive', 'limit', 'cancelled'] as const)
    assert.deepEqual(decide([attempt(kind)], 10), { action: 'stop', reason: kind });
  assert.deepEqual(decide([], 0), { action: 'stop', reason: 'limit' });
  assert.deepEqual(decide([attempt(null)], 0), { action: 'complete' });
});
test('referência usa robusto uma vez', () => {
  assert.deepEqual(decide([], 10, 'reference'), { action: 'run', profile: 'robusto' });
  assert.deepEqual(decide([attempt('implementation', 'robusto')], 10, 'reference'), { action: 'stop', reason: 'implementation' });
});
