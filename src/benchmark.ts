import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectReport, ProjectSnapshot } from './project-types.js';
import { safeRelativePath } from './workspace.js';
export interface Comparison { comparable: boolean; adaptiveTokens: number | null; directTokens: number | null; savedTokens: number | null; savedPercent: number | null; message: string }
export function compareReports(adaptive: ProjectReport, direct: ProjectReport): Comparison {
  const a = adaptive.usage.total, d = direct.usage.total;
  const comparable = adaptive.status === 'passed' && direct.status === 'passed' &&
    adaptive.check?.trusted === true && direct.check?.trusted === true && adaptive.check.tests === direct.check.tests && a !== null && d !== null && d > 0;
  const saved = comparable ? d! - a! : null;
  return { comparable, adaptiveTokens: a, directTokens: d, savedTokens: saved,
    savedPercent: comparable ? Math.round((saved! / d!) * 10000) / 100 : null,
    message: !comparable ? 'Comparação inconclusiva: ambas as execuções precisam passar no mesmo avaliador protegido e informar tokens.' :
      saved! > 0 ? 'Menos tokens observados nesta tarefa; resultado específico, sem taxa geral de economia da assinatura.' :
      'Não houve economia de tokens nesta tarefa; a estratégia deve ser reavaliada.' };
}
export async function cloneForBenchmark(snapshot: ProjectSnapshot, stateRoot: string): Promise<{ root: string; state: string }> {
  const base = resolve(stateRoot, 'benchmarks', randomUUID()), root = join(base, 'project'), state = join(base, 'state');
  await mkdir(root, { recursive: true }); await mkdir(state);
  for (const file of snapshot.files) {
    const path = join(root, safeRelativePath(file.path)); await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content, { flag: 'wx' });
  }
  return { root, state };
}
