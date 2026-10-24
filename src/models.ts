import type { Profile, RpcClient } from './contracts.js';
import { record, textField, RelayError } from './errors.js';
export interface CatalogModel { model: string; efforts: string[] }
export async function catalog(rpc: RpcClient, signal: AbortSignal): Promise<CatalogModel[]> {
  const models: CatalogModel[] = []; let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const result = record(await rpc.request('model/list', { cursor, limit: 100 }, signal));
    if (!Array.isArray(result.data)) throw new RelayError('environment', 'Catálogo incompatível.');
    for (const raw of result.data) {
      const m = record(raw);
      if (m.hidden === true) continue;
      if (!Array.isArray(m.supportedReasoningEfforts)) throw new RelayError('environment', 'Esforços do catálogo indisponíveis.');
      models.push({ model: textField(m.model), efforts: m.supportedReasoningEfforts.map(v => textField(record(v).reasoningEffort, 32)) });
    }
    if (result.nextCursor === null || result.nextCursor === undefined) return models;
    const next = textField(result.nextCursor); if (cursor === next) break; cursor = next;
  }
  throw new RelayError('environment', 'Catálogo excedeu o limite de páginas.');
}
export function requireProfiles(models: readonly CatalogModel[], profiles: Profile[]): void {
  for (const p of profiles) if (!models.some(m => m.model === p.model && m.efforts.includes(p.effort)))
    throw new RelayError('access', 'Combinação modelo/esforço ausente do catálogo desta conexão; configure novamente.');
}
