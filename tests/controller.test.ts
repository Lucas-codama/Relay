import test from 'node:test';
import assert from 'node:assert/strict';
import type { SynthesisPort, Verifier, FailureKind, RunMode } from '../src/contracts.js';
import { runDemo } from '../src/controller.js';
import { emptyUsage } from '../src/usage.js';
import { RelayError } from '../src/errors.js';
const config = { version: 1 as const, profiles: { economico: { model: 'a', effort: 'low' }, robusto: { model: 'b', effort: 'high' } } };
const baseline = { status: 'failed' as const, failure: 'implementation' as const, cases: 15,
  results: Array.from({ length: 15 }, (_, i) => ({ id: 'case' + i, status: i < 3 ? 'failed' as const : 'passed' as const, diagnostic: '' })), diagnostic: '3 falhas' };
async function run(sequence: (FailureKind | null)[], mode: RunMode = 'adaptive', clock = () => 1, maxTurns: 1 | 2 = 2) {
  let calls = 0, stopped = 0;
  const synthesis: SynthesisPort = { async synthesize() {
    const kind = sequence[calls++]; if (kind && kind !== 'implementation') throw new RelayError(kind, 'Falha sintética.');
    return { terminal: 'completed', reply: { kind: 'candidate', source: kind ? 'bad' : 'good', reason: '' },
      usage: { ...emptyUsage(), total: 10 }, threadId: 't', turnId: String(calls), observedModel: null, failure: null };
  }, async stop() { stopped++; return { stopped: true }; } };
  const verifier: Verifier = { async verify(source) {
    if (source.includes('Math.floor')) return baseline;
    return { status: source === 'good' ? 'passed' : 'failed', failure: source === 'good' ? null : 'implementation', cases: 15, results: [], diagnostic: 'synthetic' };
  } };
  const report = await runDemo(config, synthesis, verifier, { mode, now: clock, maxTurns, versions: { relay: '0', node: '24', codex: 'test' } }, new AbortController().signal);
  return { report, calls, stopped };
}
test('primeira tentativa e escalada têm número exato de turnos', async () => {
  const first = await run([null]); assert.equal(first.calls, 1); assert.equal(first.report.status, 'passed');
  const next = await run(['implementation', null]); assert.equal(next.calls, 2); assert.equal(next.report.status, 'passed');
  assert.equal(next.report.totalUsage.total, 20); assert.ok(next.stopped >= 2);
  const exhausted = await run(['implementation', 'implementation']); assert.equal(exhausted.calls, 2); assert.equal(exhausted.report.failure, 'implementation');
});
test('falhas externas não escalam, referência só usa um turno', async () => {
  for (const kind of ['access', 'environment', 'scope', 'integrity', 'inconclusive', 'cancelled', 'limit'] as const) {
    const r = await run([kind]); assert.equal(r.calls, 1); assert.equal(r.report.failure, kind);
  }
  const r = await run(['implementation'], 'reference'); assert.equal(r.calls, 1); assert.equal(r.report.attempts[0]?.profile, 'robusto');
});
test('relógio expirado impede primeira síntese', async () => {
  let time = 0;
  const r = await run([], 'adaptive', () => { time += 700_000; return time; });
  assert.equal(r.calls, 0); assert.equal(r.report.failure, 'limit');
});
test('teto reduzido de um turno impede escalada', async () => {
  const r = await run(['implementation', null], 'adaptive', () => 1, 1);
  assert.equal(r.calls, 1); assert.equal(r.report.failure, 'implementation');
});
