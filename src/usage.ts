import type { Usage } from './contracts.js';
export const emptyUsage = (): Usage => ({ input: null, cachedInput: null, output: null, reasoningOutput: null, total: null });
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function updateUsage(_previous: Usage, snapshot: unknown): Usage {
  const v = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {};
  return { input: count(v.inputTokens), cachedInput: count(v.cachedInputTokens), output: count(v.outputTokens),
    reasoningOutput: count(v.reasoningOutputTokens), total: count(v.totalTokens) };
}
export function sumUsage(values: readonly Usage[]): Usage {
  const result = emptyUsage();
  for (const key of Object.keys(result) as (keyof Usage)[]) {
    const parts = values.map(v => v[key]);
    result[key] = parts.length && parts.every(v => v !== null) ? parts.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  }
  return result;
}
