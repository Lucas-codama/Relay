import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SandboxPort } from './contracts.js';
import type { JsonlRpc } from './rpc.js';
import { startServer, readRequirements, VERIFIED_CODEX } from './app-server.js';
import { cases } from './cases.js';
import { checkAbort, record, RelayError } from './errors.js';
import { hash } from './fixture.js';
export async function commandExec(rpc: JsonlRpc, command: string[], cwd: string, input: string | null, signal: AbortSignal): Promise<string> {
  checkAbort(signal); const processId = 'relay-' + randomUUID();
  let terminal = false;
  const execution = rpc.request('command/exec', { command, cwd, processId, streamStdin: input !== null,
    timeoutMs: 20_000, outputBytesCap: 16_384, sandboxPolicy: { type: 'readOnly', networkAccess: false } }, AbortSignal.timeout(30_000));
  void execution.catch(() => undefined);
  let abort: (() => void) | undefined;
  try {
    if (input !== null) await rpc.request('command/exec/write', { processId, deltaBase64: Buffer.from(input).toString('base64'), closeStdin: true }, AbortSignal.timeout(5000));
    const result = record(await Promise.race([execution, new Promise<never>((_, reject) => {
      abort = () => reject(new RelayError(signal.reason?.name === 'TimeoutError' ? 'limit' : 'cancelled', 'Runner interrompido.'));
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    })]));
    terminal = true;
    if (result.exitCode !== 0 || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) >= 16_384)
      throw new RelayError('environment', 'Runner não concluiu com saída completa; sandbox ou limite indisponível.');
    return result.stdout;
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
    if (!terminal) {
      const cleanup = AbortSignal.timeout(10_000);
      await rpc.request('command/exec/terminate', { processId }, cleanup).catch(() => undefined);
      // close() additionally terminates and confirms the owned server tree.
      await Promise.race([execution.catch(() => undefined), new Promise<void>(resolve => {
        if (cleanup.aborted) resolve(); else cleanup.addEventListener('abort', () => resolve(), { once: true });
      })]);
    }
  }
}
export class NativeSandbox implements SandboxPort {
  private certificate: string | undefined;
  constructor(readonly stateRoot: string) {}
  private async fingerprint(): Promise<string> {
    const inputs = await Promise.all(['runner.js', 'verify.js', 'cases.js', 'sandbox-probe.js', 'sandbox.js'].map(name => readFile(new URL(name, import.meta.url), 'utf8')));
    return hash(JSON.stringify([VERIFIED_CODEX, process.version, ...inputs]));
  }
  private async withServer<T>(signal: AbortSignal, action: (rpc: JsonlRpc, cwd: string) => Promise<T>): Promise<T> {
    if (process.platform !== 'win32') throw new RelayError('environment', 'O sandbox deste protótipo foi definido para Windows.');
    const home = resolve(this.stateRoot, 'sandbox-' + randomUUID());
    const cwd = join(home, 'work'); await mkdir(cwd, { recursive: true });
    const rpc = await startServer({ home, cwd }, AbortSignal.any([signal, AbortSignal.timeout(10_000)]));
    try {
      const req = await readRequirements(rpc, signal);
      if (req !== null) {
        // Unknown managed policy must be reviewed; never silently replace it.
        throw new RelayError('environment', 'Há requisitos gerenciados; compatibilidade precisa ser comprovada antes da execução.');
      }
      return await action(rpc, cwd);
    } finally { await rpc.close(); }
  }
  async preflight(signal: AbortSignal): Promise<void> {
    const fingerprint = await this.fingerprint();
    await this.withServer(signal, async (rpc, cwd) => {
      const sentinel = join(resolve(this.stateRoot), 'sentinel-' + randomUUID());
      await writeFile(sentinel, 'protected-synthetic', { flag: 'wx' });
      const listener = createServer(socket => socket.end());
      await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
      try {
        const address = listener.address(); if (!address || typeof address === 'string') throw new Error();
        const probe = record(JSON.parse(await commandExec(rpc, [process.execPath, fileURLToPath(new URL('sandbox-probe.js', import.meta.url)), sentinel, String(address.port)], cwd, null, signal)));
        if (probe.writeDenied !== true || probe.networkDenied !== true || probe.hasCredential !== false || await readFile(sentinel, 'utf8') !== 'protected-synthetic')
          throw new RelayError('environment', 'O sandbox nativo não bloqueou escrita/rede; execução de candidatos bloqueada.');
      } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
    });
    this.certificate = fingerprint;
    await writeFile(join(this.stateRoot, 'preflight.json'), JSON.stringify({ version: 1, codex: VERIFIED_CODEX, node: process.version,
      fingerprint, policy: { type: 'readOnly', networkAccess: false, windowsSandbox: 'mxc' }, passed: true }) + '\n');
  }
  async run(source: string, signal: AbortSignal): Promise<unknown> {
    if (this.certificate !== await this.fingerprint()) throw new RelayError('environment', 'Execute a prova do sandbox para esta versão antes de verificar candidatos.');
    if (Buffer.byteLength(source) > 64 * 1024) throw new RelayError('scope', 'Fonte excede 64 KiB.');
    return this.withServer(signal, async (rpc, cwd) => {
      const input = JSON.stringify({ source, cases: cases.map(({ id, args }) => ({ id, args })) });
      const output = await commandExec(rpc, [process.execPath, '--max-old-space-size=96', fileURLToPath(new URL('runner.js', import.meta.url))], cwd, input, signal);
      try { return JSON.parse(output); } catch { throw new RelayError('inconclusive', 'Runner retornou saída inválida.'); }
    });
  }
}
