import type { FailureKind, Profile, Usage, ProviderFailure } from './contracts.js';
export interface ProjectFile { path: string; content: string; hash: string }
export interface ProjectSnapshot { root: string; files: ProjectFile[]; omitted: number }
export interface Edit { path: string; before: string; after: string }
export interface ProjectReply { kind: 'edit' | 'answer' | 'question' | 'read'; message: string; edits: Edit[]; read?: string[] }
export type RouteLevel = 'light' | 'standard' | 'deep';
export interface Route { level: RouteLevel; profile: Profile; reason: string }
export interface CheckResult {
  status: 'passed' | 'failed' | 'unavailable'; failure: FailureKind | null;
  diagnostic: string; failedFiles: string[]; tests: number; trusted: boolean;
  passed?: number; failed?: number;
}
export interface ProjectAttempt {
  level: RouteLevel; profile: Profile; usage: Usage; status: string;
  changed: string[]; check: CheckResult | null; contextBytes: number; durationMs: number;
  created?: string[]; modified?: string[];
}
export interface ProjectReport {
  version: 1; id: string; status: 'passed' | 'failed' | 'answer' | 'question'; message: string;
  failure: FailureKind | null; attempts: ProjectAttempt[]; usage: Usage;
  contextBytes: number; fullContextBytes: number; cacheHit: boolean;
  check: CheckResult | null; durationMs: number; backupId: string | null;
  nextCommand?: string;
  providerFailure?: ProviderFailure;
}
export interface Workspace {
  snapshot(): Promise<ProjectSnapshot>;
  apply(edits: Edit[], allowedPaths?: readonly string[]): Promise<{ backupId: string; changed: string[] }>;
  undo(backupId: string): Promise<string[]>;
}
