import test from 'node:test'; import assert from 'node:assert/strict';
import { compareReports } from '../src/benchmark.js'; import type { ProjectReport } from '../src/project-types.js';
import { emptyUsage } from '../src/usage.js';
const report = (tokens: number): ProjectReport => ({ version: 1, id: 'test', status: 'passed', message: '', failure: null, attempts: [], usage: { ...emptyUsage(), total: tokens }, contextBytes: 0, fullContextBytes: 0, cacheHit: false, check: { status: 'passed', failure: null, diagnostic: '', failedFiles: [], tests: 5, trusted: true }, durationMs: 1, backupId: null });
test('economia só existe com qualidade comparável e contabiliza também prejuízo', () => {
  assert.equal(compareReports(report(60), report(100)).savedPercent, 40);
  assert.equal(compareReports(report(120), report(100)).savedPercent, -20);
  assert.equal(compareReports({ ...report(60), status: 'failed' }, report(100)).savedPercent, null);
  assert.equal(compareReports({ ...report(60), check: { ...report(60).check!, trusted: false } }, report(100)).comparable, false);
});
