import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReport, renderReport } from '../src/report.js';
import { emptyUsage } from '../src/usage.js';
import type { RunReport } from '../src/contracts.js';
test('allowlist preserva evidências sem serializar credenciais ou fonte', () => {
  const versions = { relay: '0', node: '24', codex: 'test' };
  const verification = { status: 'passed' as const, failure: null, cases: 15, results: [{ id: 'partial', status: 'passed' as const, diagnostic: 'OK' }], diagnostic: '15/15' };
  const report: RunReport & { accessToken: string } = { version: 1, status: 'passed', failure: null, mode: 'adaptive', versions, initialHash: 'synthetic',
    baseline: verification, totalUsage: emptyUsage(), durationMs: 12, accessToken: 'SENTINEL-SECRET', attempts: [{ localId: 'one', versions, durationMs: 10,
      profile: 'economico', status: 'passed', failure: null, diagnostic: '', threadId: 't', turnId: 'r', requested: { model: 'a', effort: 'low' },
      observedModel: null, usage: emptyUsage(), verification, diffArtifact: 'relay-demo-1234/abcd.patch' }] };
  const raw = JSON.stringify(sanitizeReport(report)); const saved = JSON.parse(raw);
  assert.equal(raw.includes('SENTINEL'), false); assert.equal(saved.attempts[0].durationMs, 10);
  assert.equal(saved.attempts[0].verification.results[0].id, 'partial'); assert.equal(saved.attempts[0].versions.codex, 'test');
  assert.equal(saved.attempts[0].diffArtifact, 'relay-demo-1234/abcd.patch'); assert.ok(renderReport(report).includes('indisponível'));
});
