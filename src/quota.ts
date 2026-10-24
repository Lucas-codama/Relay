import type { QuotaStatus, QuotaWindow } from './contracts.js';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function parseQuota(raw: unknown, now = Date.now()): QuotaStatus {
  const data = object(raw), buckets = object(data.rateLimitsByLimitId);
  const snapshots = Object.keys(buckets).length ? Object.entries(buckets) : [['codex', data.rateLimits]];
  const windows: QuotaWindow[] = [];
  for (const [id, rawSnapshot] of snapshots.slice(0, 12)) {
    const snapshot = object(rawSnapshot);
    for (const key of ['primary', 'secondary'] as const) {
      const value = object(snapshot[key]), used = value.usedPercent;
      if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) continue;
      windows.push({ bucket: String(id).slice(0, 64), window: key, usedPercent: used,
        windowDurationMins: integer(value.windowDurationMins), resetsAt: integer(value.resetsAt) });
    }
  }
  return { state: windows.length ? 'available' : 'unavailable', windows, updatedAt: now };
}
