export type ProfileName = 'economico' | 'robusto';
export interface Profile { model: string; effort: string }
export interface RelayConfig {
  version: 1;
  profiles: Record<ProfileName, Profile>;
}
export type FailureKind =
  | 'implementation' | 'environment' | 'access' | 'scope'
  | 'inconclusive' | 'limit' | 'cancelled' | 'integrity';
export interface Usage {
  input: number | null; cachedInput: number | null;
  output: number | null; reasoningOutput: number | null;
  total: number | null;
}
export type RunMode = 'adaptive' | 'reference';
export interface Versions { relay: string; node: string; codex: string }
export interface AttemptResult {
  localId: string;
  versions: Versions;
  durationMs: number;
  profile: ProfileName;
  status: 'passed' | 'failed';
  failure: FailureKind | null;
  diagnostic: string;
  threadId: string | null;
  turnId: string | null;
  requested: Profile;
  observedModel: string | null;
  usage: Usage;
  verification: Verification | null;
  diffArtifact: string | null;
}
export type Decision =
  | { action: 'complete' }
  | { action: 'run'; profile: ProfileName }
  | { action: 'stop'; reason: FailureKind };
export interface Verification {
  status: 'passed' | 'failed';
  failure: FailureKind | null;
  cases: number;
  results: { id: string; status: 'passed' | 'failed'; diagnostic: string }[];
  diagnostic: string;
}
export interface RpcClient {
  request(method: string, params: unknown, signal: AbortSignal): Promise<unknown>;
  notify(method: string, params: unknown): void;
  onNotification(listener: (method: string, params: unknown) => void): () => void;
  close(): Promise<void>;
}
export interface CredentialRecord {
  registrationId: string;
  issuer: string; subject: string; clientId: string; hostId: string;
  accessToken: string; refreshToken: string; idToken: string;
  expiresAt: number; scopes: string[];
}
export interface SessionStore {
  listRegistrations(): Promise<{ id: string; label: string }[]>;
  read(registrationId: string): Promise<CredentialRecord | null>;
  write(record: CredentialRecord): Promise<void>;
  withLock<T>(registrationId: string, fn: () => Promise<T>): Promise<T>;
}
export interface SynthesisResult {
  terminal: 'completed' | 'failed' | 'interrupted';
  reply: unknown; usage: Usage; threadId: string | null; turnId: string | null;
  observedModel: string | null; failure: FailureKind | null;
  providerFailure?: ProviderFailure;
}
export interface ProviderFailure {
  kind: FailureKind;
  reason: 'quota' | 'rate' | 'authentication' | 'forbidden' | 'unavailable' | 'invalid-request' | 'unknown';
  message: string; code?: string; httpStatus?: number;
}
export interface SynthesisPort {
  synthesize(profile: Profile, prompt: string, signal: AbortSignal, onProgress?: (event: SynthesisProgress) => void): Promise<SynthesisResult>;
  stop(): Promise<{ stopped: boolean }>;
}
export interface QuotaWindow {
  bucket: string; window: 'primary' | 'secondary'; usedPercent: number;
  windowDurationMins: number | null; resetsAt: number | null;
}
export interface QuotaStatus { state: 'available' | 'unavailable'; windows: QuotaWindow[]; updatedAt: number }
export type SynthesisProgress = { type: 'usage'; usage: Usage } | { type: 'quota'; quota: QuotaStatus } | { type: 'model'; model: string };
export interface SandboxPort {
  run(source: string, signal: AbortSignal): Promise<unknown>;
}
export interface Verifier {
  verify(source: string, signal: AbortSignal): Promise<Verification>;
}
export interface RunOptions {
  mode: RunMode;
  versions: Versions;
  now: () => number;
  prompt?: string;
  maxTurns?: 1 | 2;
}
export interface RunReport {
  version: 1; status: 'passed' | 'failed'; failure: FailureKind | null;
  mode: RunMode; versions: Versions; initialHash: string;
  attempts: AttemptResult[]; durationMs: number; totalUsage: Usage;
  baseline: Verification;
}
