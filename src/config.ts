import { readFile } from 'node:fs/promises';
import type { RelayConfig, Profile } from './contracts.js';
import { exactKeys, record, textField, RelayError } from './errors.js';
export function parseConfig(value: unknown): RelayConfig {
  const root = record(value); exactKeys(root, ['version', 'profiles']);
  if (root.version !== 1) throw new RelayError('scope', 'Versão de perfis não suportada.');
  const profiles = record(root.profiles); exactKeys(profiles, ['economico', 'robusto']);
  const parse = (v: unknown): Profile => {
    const p = record(v); exactKeys(p, ['model', 'effort']);
    return { model: textField(p.model), effort: textField(p.effort, 32) };
  };
  const economico = parse(profiles.economico), robusto = parse(profiles.robusto);
  if (economico.model === robusto.model && economico.effort === robusto.effort)
    throw new RelayError('scope', 'Escolha duas combinações distintas de modelo/esforço.');
  return { version: 1, profiles: { economico, robusto } };
}
export async function readConfig(path: string): Promise<RelayConfig> {
  try { return parseConfig(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError('scope', 'Perfis ausentes ou inválidos; configure dois perfis pelo catálogo.');
  }
}
