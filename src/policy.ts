import type { AttemptResult, Decision, RunMode } from './contracts.js';
export function decide(results: readonly AttemptResult[], remainingMs: number, mode: RunMode = 'adaptive'): Decision {
  const last = results.at(-1);
  if (last?.status === 'passed') return { action: 'complete' };
  if (last && last.failure !== 'implementation') return { action: 'stop', reason: last.failure ?? 'inconclusive' };
  if (remainingMs <= 0) return { action: 'stop', reason: 'limit' };
  if (!last) return { action: 'run', profile: mode === 'reference' ? 'robusto' : 'economico' };
  if (mode === 'adaptive' && results.length === 1 && last.profile === 'economico')
    return { action: 'run', profile: 'robusto' };
  return { action: 'stop', reason: 'implementation' };
}
