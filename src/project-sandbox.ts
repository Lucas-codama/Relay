import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { ProjectSnapshot, CheckResult, ProjectFile } from './project-types.js';
import { ownProcess } from './processes.js';
import { checkAbort, RelayError } from './errors.js';
import { safeRelativePath } from './workspace.js';
import { hash, assertRegular } from './fixture.js';
export interface ProjectChecker { check(snapshot: ProjectSnapshot, signal: AbortSignal): Promise<CheckResult> }
interface Execution { code: number | null; stdout: string; stderr: string }
export function sandboxProfile(stage: string, scratch: string, helper: string): string {
  return `default_permissions="relay-check"\n[windows]\nsandbox="mxc"\n[permissions.relay-check.filesystem]\n":root"="deny"\n":minimal"="read"\n${JSON.stringify(dirname(process.execPath))}="read"\n${JSON.stringify(stage)}="read"\n${JSON.stringify(helper)}="read"\n${JSON.stringify(scratch)}="write"\n[permissions.relay-check.network]\nenabled=false\n`;
}
async function execute(home: string, stage: string, scratch: string, argv: string[], signal: AbortSignal): Promise<Execution> {
  checkAbort(signal);
  const args = ['sandbox', '--permission-profile', 'relay-check', '--include-managed-config', '--cd', stage, '--', ...argv];
  // Inherit these fixed flags in Node children spawned by tests, too. They avoid
  // Node's root-directory realpath lookup; MXC permissions remain unchanged.
  const owner = ownProcess('codex', args, { cwd: stage, env: { CODEX_HOME: home, TEMP: scratch, TMP: scratch,
    NODE_OPTIONS: '--preserve-symlinks --preserve-symlinks-main' }, treeRequired: true });
  let stdout = '', stderr = '', capped = false;
  const consume = (chunk: Buffer, output: 'stdout' | 'stderr') => {
    if (capped) return;
    if (output === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 128 * 1024) { capped = true; void owner.stop().catch(() => undefined); }
  };
  owner.child.stdout.on('data', b => consume(b, 'stdout')); owner.child.stderr.on('data', b => consume(b, 'stderr'));
  const abort = () => { void owner.stop().catch(() => undefined); }; signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) abort(); await owner.exited; checkAbort(signal);
    if (capped) throw new RelayError('limit', 'Saída dos testes excedeu 128 KiB.');
    // Codex sandbox owns an MXC container. Its terminal exit is the command result;
    // a nonzero status is never interpreted as successful cleanup/verification.
    return { code: owner.child.exitCode, stdout, stderr };
  } finally { signal.removeEventListener('abort', abort); if (!owner.stopped) await owner.stop(); }
}
export class NativeProjectChecker implements ProjectChecker {
  private readonly trustedTests: Map<string, string>;
  constructor(private readonly stateRoot: string, trustedTests: readonly ProjectFile[] = []) {
    this.trustedTests = new Map(trustedTests.map(file => [file.path, hash(file.content)]));
  }
  async check(snapshot: ProjectSnapshot, callerSignal: AbortSignal): Promise<CheckResult> {
    if (process.platform !== 'win32') throw new RelayError('environment', 'Verificação de projetos requer o MXC do Windows nesta versão.');
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(60_000)]);
    const logicalRoot = resolve(this.stateRoot, 'checks', randomUUID());
    await mkdir(logicalRoot, { recursive: true }); await assertRegular(logicalRoot);
    // Native MXC children do not inherit the desktop MSIX path virtualization.
    const root = await realpath(logicalRoot), stage = join(root, 'stage'), scratch = join(root, 'scratch'), home = join(root, 'codex');
    await Promise.all([stage, scratch, home].map(path => mkdir(path, { recursive: true })));
    for (const file of snapshot.files) {
      const path = join(stage, safeRelativePath(file.path)); await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content, { flag: 'wx' });
    }
    const probePath = fileURLToPath(new URL('project-probe.js', import.meta.url));
    await writeFile(join(home, 'config.toml'), sandboxProfile(stage, scratch, dirname(probePath)), { flag: 'wx' });
    const sentinel = join(root, 'private-canary'); await writeFile(sentinel, 'relay-private-' + randomUUID(), { flag: 'wx' });
    const listener = createServer(socket => socket.end());
    await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    try {
      const address = listener.address(); if (!address || typeof address === 'string') throw new Error();
      const probeSource = await readFile(probePath, 'utf8');
      const probe = await execute(home, stage, scratch, [process.execPath, '--input-type=module', '-e', probeSource, 'relay-probe', sentinel, String(address.port)], signal);
      let result: Record<string, unknown>;
      try { result = JSON.parse(probe.stdout); } catch { throw new RelayError('environment', 'O perfil mínimo não iniciou o probe: ' + safeDiagnostic(probe.stderr, stage).slice(-1200)); }
      if (probe.code !== 0 || result.readDenied !== true || result.writeDenied !== true || result.networkDenied !== true || result.hasCredential !== false)
        throw new RelayError('environment', 'Isolamento incompleto: candidatos não serão executados.');
    } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
    const tests = snapshot.files.filter(f => /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?js$/i.test(f.path)).map(f => f.path);
    if (!tests.length) {
      // Syntax-only checks do not execute candidate code or claim functional correctness.
      for (const file of snapshot.files.filter(f => /\.[cm]?js$/i.test(f.path))) {
        const result = await execute(home, stage, scratch, [process.execPath, '--preserve-symlinks', '--preserve-symlinks-main', '--check', file.path], signal);
        if (result.code !== 0) return { status: 'failed', failure: 'implementation', diagnostic: safeDiagnostic(result.stderr + result.stdout, stage), failedFiles: [file.path], tests: 0, trusted: false };
      }
      return { status: 'unavailable', failure: null, diagnostic: 'Sintaxe JavaScript verificada; faltam testes funcionais executáveis. Não é uma aprovação funcional.', failedFiles: [], tests: 0, trusted: false };
    }
    const result = await execute(home, stage, scratch, [process.execPath, '--preserve-symlinks', '--preserve-symlinks-main', '--test', '--test-concurrency=1', '--test-reporter=tap', ...tests], signal);
    const output = result.stdout + '\n' + result.stderr;
    const count = Number([...output.matchAll(/^# tests (\d+)\s*$/gm)].at(-1)?.[1] ?? 0);
    const failures = Number([...output.matchAll(/^# fail (\d+)\s*$/gm)].at(-1)?.[1] ?? -1);
    const passedCount = Number([...output.matchAll(/^# pass (\d+)\s*$/gm)].at(-1)?.[1] ?? -1);
    const failedFiles = snapshot.files.filter(f => output.replaceAll('\\', '/').includes('/' + f.path) || output.includes(f.path + ':')).map(f => f.path);
    const passed = result.code === 0 && count > 0 && failures === 0;
    const diagnostic = safeDiagnostic(output, stage);
    return { status: passed ? 'passed' : 'failed', failure: passed ? null : projectFailure(output, count),
      diagnostic: passed ? `${count} testes passaram.` : diagnostic, failedFiles, tests: count,
      ...(passedCount >= 0 ? { passed: passedCount } : {}), ...(failures >= 0 ? { failed: failures } : {}),
      trusted: this.trustedTests.size > 0 && tests.length === this.trustedTests.size && tests.every(t => this.trustedTests.get(t) === hash(snapshot.files.find(f => f.path === t)!.content)) };
  }
}
export function projectFailure(output: string, count: number): 'implementation' | 'environment' {
  if (/EPERM[^\n]*lstat/.test(output) && output.includes('toRealPath')) return 'environment';
  return count > 0 || /(?:AssertionError|SyntaxError|ERR_ASSERTION|ERR_MODULE_NOT_FOUND)/.test(output) ? 'implementation' : 'environment';
}
function safeDiagnostic(text: string, stage: string): string {
  return text.replaceAll(stage, '<project>').replaceAll(stage.replaceAll('\\', '/'), '<project>')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').slice(-6000);
}
