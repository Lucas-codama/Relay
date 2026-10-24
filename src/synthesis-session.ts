import type { CredentialRecord } from './contracts.js';
import { RelayError, checkAbort } from './errors.js';
/** Refresh the selected registration before a turn; never select another account. */
export function createTokenProvider(initial: CredentialRecord,
  renew: (registration: string, signal: AbortSignal) => Promise<CredentialRecord>, now = Date.now) {
  let current = initial;
  return async (signal: AbortSignal): Promise<string> => {
    checkAbort(signal);
    if (current.expiresAt <= now() + 60_000) {
      const refreshed = await renew(initial.registrationId, signal);
      if (refreshed.registrationId !== initial.registrationId) throw new RelayError('integrity', 'Renovação retornou outra conta.');
      current = refreshed;
    }
    checkAbort(signal);
    return current.accessToken;
  };
}
