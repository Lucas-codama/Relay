import type { SandboxPort, Verifier, Verification } from './contracts.js';
import { cases } from './cases.js';
import { checkAbort, failure, record } from './errors.js';
export function createVerifier(sandbox: SandboxPort): Verifier {
  return { async verify(source, signal): Promise<Verification> {
    try {
      checkAbort(signal);
      const raw = await sandbox.run(source, signal);
      if (!Array.isArray(raw) || raw.length !== cases.length) throw new Error();
      const results = cases.map((c, i) => {
        const value = record(raw[i]);
        if (value.id !== c.id || !['number', 'throw', 'invalid'].includes(String(value.kind))) throw new Error();
        const passed = c.expected === 'TypeError' ? value.kind === 'throw' && value.name === 'TypeError' :
          value.kind === 'number' && typeof value.value === 'number' && Number.isFinite(value.value) && Math.abs(value.value - c.expected) <= 1e-9;
        return { id: c.id, status: passed ? 'passed' as const : 'failed' as const, diagnostic: passed ? 'OK' : 'Contrato não atendido.' };
      });
      const passed = results.every(r => r.status === 'passed');
      return { status: passed ? 'passed' : 'failed', failure: passed ? null : 'implementation', cases: results.length, results,
        diagnostic: passed ? '15/15 casos passaram.' : results.filter(r => r.status === 'failed').map(r => r.id).join(', ') };
    } catch (error) {
      const kind = error instanceof Error && error.constructor === Error ? 'inconclusive' : failure(error).kind;
      return { status: 'failed', failure: kind, cases: 0, results: [], diagnostic: 'Verificação não concluída: ' + kind };
    }
  } };
}
