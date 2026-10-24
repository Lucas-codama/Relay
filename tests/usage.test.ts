import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyUsage, updateUsage, sumUsage } from '../src/usage.js';
test('snapshots substituem; turnos somam sem duplicar cache', () => {
  const a = updateUsage(emptyUsage(), { inputTokens: 7, cachedInputTokens: 3, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 10 });
  const b = updateUsage(a, { inputTokens: 9, cachedInputTokens: 4, outputTokens: 5, totalTokens: 14 });
  assert.equal(b.total, 14);
  assert.equal(b.reasoningOutput, null);
  assert.equal(sumUsage([b, updateUsage(emptyUsage(), { totalTokens: 6 })]).total, 20);
  assert.equal(sumUsage([b, emptyUsage()]).total, null);
  assert.equal(updateUsage(a, { totalTokens: -1 }).total, null);
});
