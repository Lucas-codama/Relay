import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunReport, Usage, Verification } from './contracts.js';
import { assertRegular } from './fixture.js';
const safe = (text: string): string => text.replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 512);
const versions = (v: RunReport['versions']) => ({ relay: safe(v.relay), node: safe(v.node), codex: safe(v.codex) });
const usage = (v: Usage): Usage => ({ input: v.input, cachedInput: v.cachedInput, output: v.output, reasoningOutput: v.reasoningOutput, total: v.total });
const verification = (v: Verification | null) => v && ({ status: v.status, failure: v.failure, cases: v.cases,
  diagnostic: safe(v.diagnostic), results: v.results.map(c => ({ id: safe(c.id), status: c.status, diagnostic: safe(c.diagnostic) })) });
export function sanitizeReport(r: RunReport): unknown {
  return { version: 1, status: r.status, failure: r.failure, mode: r.mode, versions: versions(r.versions), initialHash: r.initialHash,
    durationMs: r.durationMs, totalUsage: usage(r.totalUsage), baseline: verification(r.baseline),
    attempts: r.attempts.map(a => ({ localId: a.localId, versions: versions(a.versions), durationMs: a.durationMs,
      profile: a.profile, status: a.status, failure: a.failure, diagnostic: safe(a.diagnostic), threadId: a.threadId,
      turnId: a.turnId, requested: { model: safe(a.requested.model), effort: safe(a.requested.effort) },
      observedModel: a.observedModel && safe(a.observedModel), usage: usage(a.usage), verification: verification(a.verification),
      diffArtifact: a.diffArtifact && /^relay-demo-[a-f0-9-]+\/[a-f0-9-]+\.patch$/.test(a.diffArtifact) ? a.diffArtifact : null })) };
}
export function renderReport(report: RunReport): string {
  const rows = [`Relay — ${report.mode === 'adaptive' ? 'adaptativo' : 'referência robusta'}`, `Resultado: ${report.status === 'passed' ? 'verificado' : 'falhou (' + report.failure + ')'}`];
  for (const a of report.attempts) rows.push(`${a.profile}: ${a.status}; ${Math.round(a.durationMs)} ms; ${a.verification?.diagnostic ?? a.failure}`);
  rows.push(`Tokens totais observados: ${report.totalUsage.total ?? 'indisponível'}. Tempo: ${Math.round(report.durationMs)} ms.`);
  rows.push('O consumo observado não demonstra uma taxa geral de economia da assinatura.');
  return rows.map(safe).join('\n') + '\n';
}
export async function saveReport(report: RunReport, stateRoot: string): Promise<string> {
  await assertRegular(stateRoot);
  const dir = join(stateRoot, 'reports'); await mkdir(dir, { recursive: true }); await assertRegular(dir);
  const path = join(dir, randomUUID() + '.json');
  await writeFile(path, JSON.stringify(sanitizeReport(report), null, 2) + '\n', { flag: 'wx' });
  return path;
}
