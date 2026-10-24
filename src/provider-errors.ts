import type { FailureKind } from './contracts.js';

export interface ProviderDiagnostic {
  kind: FailureKind;
  reason: 'quota' | 'rate' | 'authentication' | 'forbidden' | 'unavailable' | 'invalid-request' | 'unknown';
  message: string;
  code?: string;
  httpStatus?: number;
}
const unknown: ProviderDiagnostic = { kind: 'inconclusive', reason: 'unknown', message: 'Não foi possível concluir a solicitação.' };
const quota: ProviderDiagnostic = { kind: 'access', reason: 'quota', message: 'Limite de uso atingido.' };
const rate: ProviderDiagnostic = { kind: 'access', reason: 'rate', message: 'Muitas solicitações. Tente novamente em instantes.' };
const authentication: ProviderDiagnostic = { kind: 'access', reason: 'authentication', message: 'Sessão não autorizada. Entre novamente.' };
const forbidden: ProviderDiagnostic = { kind: 'access', reason: 'forbidden', message: 'Acesso ao modelo recusado.' };
const unavailable: ProviderDiagnostic = { kind: 'environment', reason: 'unavailable', message: 'Serviço indisponível. Tente novamente em instantes.' };
const invalid: ProviderDiagnostic = { kind: 'inconclusive', reason: 'invalid-request', message: 'Solicitação recusada pelo provedor.' };
const limit: ProviderDiagnostic = { kind: 'limit', reason: 'unknown', message: 'Limite de contexto ou sessão atingido.' };
const scope: ProviderDiagnostic = { kind: 'scope', reason: 'forbidden', message: 'Solicitação recusada pela política do provedor.' };
const codes = new Map<string, ProviderDiagnostic>([
  ['usage_limit_exceeded', quota], ['rate_limit_exceeded', rate], ['unauthorized', authentication],
  ['context_window_exceeded', limit], ['session_budget_exceeded', limit], ['cyber_policy', scope],
  ['misalignment_policy_violation', scope], ['too_many_denials', scope], ['flex_unavailable', unavailable],
  ['server_overloaded', unavailable], ['internal_server_error', unavailable], ['sandbox_error', unavailable],
  ['thread_rollback_failed', unavailable], ['bad_request', invalid], ['other', unknown],
]);
const connectionCodes = new Set(['http_connection_failed', 'response_stream_connection_failed',
  'response_stream_disconnected', 'response_too_many_failed_attempts']);
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function normalize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}
function statusDiagnostic(status: number): ProviderDiagnostic {
  if (status === 401) return authentication;
  if (status === 403) return forbidden;
  if (status === 429) return rate;
  if (status >= 500) return unavailable;
  if (status >= 400) return invalid;
  return unknown;
}
/** Only structured protocol evidence crosses this boundary; provider text stays private. */
export function classifyProviderError(raw: unknown): ProviderDiagnostic {
  const root = object(raw);
  const error = object(root?.error) ?? root;
  const info = error?.codexErrorInfo ?? object(error?.data)?.codexErrorInfo;
  if (typeof info === 'string') {
    const code = normalize(info);
    const diagnostic = codes.get(code);
    return diagnostic ? { ...diagnostic, code } : { ...unknown };
  }
  const fields = object(info);
  if (fields) for (const [name, detail] of Object.entries(fields)) {
    const code = normalize(name);
    if (!connectionCodes.has(code)) continue;
    const nested = object(detail);
    const status = nested?.httpStatusCode ?? nested?.http_status_code ?? nested?.HttpStatusCode;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)
      return { ...statusDiagnostic(status), code, httpStatus: status };
  }
  return { ...unknown };
}
