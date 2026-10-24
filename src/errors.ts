import type { FailureKind, ProviderFailure } from './contracts.js';
export class RelayError extends Error {
  constructor(public readonly kind: FailureKind, message: string, public readonly providerFailure?: ProviderFailure) { super(message); }
}
export function failure(error: unknown): RelayError {
  return error instanceof RelayError ? error : new RelayError('environment', 'Falha interna; consulte os checks locais.');
}
export function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new RelayError(signal.reason?.name === 'TimeoutError' ? 'limit' : 'cancelled', 'Execução interrompida.');
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new RelayError('inconclusive', 'Objeto inválido no protocolo.');
  return value as Record<string, unknown>;
}
export function textField(value: unknown, max = 512): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max || /[\x00-\x1f]/.test(value))
    throw new RelayError('inconclusive', 'Campo de texto inválido.');
  return value;
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
    throw new RelayError('inconclusive', 'Campos ausentes ou desconhecidos.');
}
