import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AttemptResult, RelayConfig, SynthesisPort, Verifier, RunOptions, RunReport, Verification } from './contracts.js';
import { taskContract } from './cases.js';
import { createFixture, applyCandidate, hash } from './fixture.js';
import { decide } from './policy.js';
import { parseCandidate } from './codex.js';
import { emptyUsage, sumUsage } from './usage.js';
import { checkAbort, failure, RelayError } from './errors.js';
export async function runDemo(config: RelayConfig, synthesis: SynthesisPort, verifier: Verifier, options: RunOptions, signal: AbortSignal): Promise<RunReport> {
  const started = options.now(), deadline = started + 600_000;
  const globalSignal = AbortSignal.any([signal, AbortSignal.timeout(600_000)]);
  const fixture = await createFixture(); let current = await readFile(fixture.sourcePath, 'utf8');
  const prompt = options.prompt ?? 'Corrija o cálculo de desconto e preserve os casos válidos.';
  if (!prompt.trim() || Buffer.byteLength(prompt) > 8192) throw new RelayError('scope', 'Pedido vazio ou maior que 8 KiB.');
  const attempts: AttemptResult[] = [];
  let baseline: Verification = { status: 'failed', failure: 'inconclusive', cases: 0, results: [], diagnostic: 'Baseline não executada.' };
  const report = (kind: RunReport['failure']): RunReport => ({ version: 1, status: kind ? 'failed' : 'passed', failure: kind,
    mode: options.mode, versions: options.versions, initialHash: fixture.initialHash, baseline,
    attempts, durationMs: Math.max(0, options.now() - started), totalUsage: sumUsage(attempts.map(a => a.usage)) });
  try {
    checkAbort(globalSignal);
    baseline = await verifier.verify(current, AbortSignal.any([globalSignal, AbortSignal.timeout(20_000)]));
    if (baseline.failure !== 'implementation') return report(baseline.failure ?? 'integrity');
    if (baseline.cases !== 15 || baseline.results.filter(c => c.status === 'failed').length !== 3) return report('integrity');
    while (true) {
      checkAbort(globalSignal);
      const decision = decide(attempts, deadline - options.now(), options.mode);
      if (decision.action === 'complete') return report(null);
      if (decision.action === 'stop') return report(decision.reason);
      if (attempts.length >= (options.mode === 'reference' ? 1 : options.maxTurns ?? 2)) return report(attempts.at(-1)?.failure ?? 'limit');
      const profile = config.profiles[decision.profile], attemptStarted = options.now();
      const localId = randomUUID();
      const attempt: AttemptResult = { localId, versions: options.versions, durationMs: 0, profile: decision.profile,
        status: 'failed', failure: 'inconclusive', diagnostic: '', threadId: null, turnId: null, requested: profile,
        observedModel: null, usage: emptyUsage(), verification: null, diffArtifact: null };
      try {
        const diagnostic = attempts.at(-1)?.verification?.diagnostic ?? '';
        const input = JSON.stringify({ request: prompt, contract: taskContract, source: current, previousVerification: diagnostic });
        if (Buffer.byteLength(input) > (attempts.length ? 96 : 32) * 1024) throw new RelayError('scope', 'Contexto excede o limite da tentativa.');
        const attemptSignal = AbortSignal.any([globalSignal, AbortSignal.timeout(Math.min(180_000, Math.max(1, deadline - options.now())))]);
        const result = await synthesis.synthesize(profile, input, attemptSignal);
        attempt.threadId = result.threadId; attempt.turnId = result.turnId;
        attempt.observedModel = result.observedModel; attempt.usage = result.usage;
        if (!(await synthesis.stop()).stopped) throw new RelayError('environment', 'Encerramento não confirmado.');
        if (result.terminal !== 'completed') throw new RelayError(result.failure ?? 'inconclusive', 'O turno não concluiu.');
        const candidate = parseCandidate(result.reply);
        if (candidate.kind === 'needsInput') throw new RelayError('scope', 'Esclarecimento solicitado: ' + candidate.reason.replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 400));
        checkAbort(attemptSignal);
        await applyCandidate(fixture.sourcePath, candidate.source, hash(current));
        const diffName = localId + '.patch';
        const lines = (text: string) => { const parts = text.split('\n'); if (parts.at(-1) === '') parts.pop(); return parts; };
        const before = lines(current), after = lines(candidate.source);
        await writeFile(join(fixture.root, diffName), `--- discount.mjs\n+++ discount.mjs\n@@ -1,${before.length} +1,${after.length} @@\n${before.map(s => '-' + s).join('\n')}\n${after.map(s => '+' + s).join('\n')}\n`, { flag: 'wx' });
        attempt.diffArtifact = 'relay-demo-' + fixture.root.split(/[\\/]/).at(-1)?.replace(/^relay-demo-/, '') + '/' + diffName;
        current = candidate.source;
        attempt.verification = await verifier.verify(current, AbortSignal.any([attemptSignal, AbortSignal.timeout(20_000)]));
        checkAbort(attemptSignal);
        if (options.now() >= deadline) throw new RelayError('limit', 'Prazo total esgotado.');
        attempt.status = attempt.verification.status; attempt.failure = attempt.verification.failure;
        attempt.diagnostic = attempt.verification.diagnostic;
      } catch (error) {
        const e = failure(error); attempt.failure = e.kind; attempt.diagnostic = e.message;
        try { if (!(await synthesis.stop()).stopped) attempt.failure = 'environment'; }
        catch { attempt.failure = 'environment'; attempt.diagnostic = 'Encerramento da tentativa não confirmado; nenhuma escalada.'; }
      }
      attempt.durationMs = Math.max(0, options.now() - attemptStarted); attempts.push(attempt);
    }
  } catch (error) { return report(failure(error).kind); }
}
