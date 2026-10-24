import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { RelayError } from './errors.js';
export function minimalEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA'])
    if (process.env[key]) result[key] = process.env[key];
  return { ...result, ...extra };
}
export interface ProcessOwner {
  child: ChildProcessWithoutNullStreams;
  readonly stopped: boolean;
  exited: Promise<void>;
  stop(): Promise<{ stopped: boolean }>;
}
export function ownProcess(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; treeRequired?: boolean } = {}): ProcessOwner {
  const child = spawn(command, args, { ...options, env: minimalEnv(options.env), windowsHide: true, stdio: 'pipe', shell: false });
  let stopped = false;
  let treeConfirmed = !options.treeRequired;
  let stopping: Promise<{ stopped: boolean }> | undefined;
  const exited = new Promise<void>(resolve => {
    child.once('close', () => { stopped = true; resolve(); });
    child.once('error', () => { stopped = true; resolve(); });
  });
  // Bounded drain only: stderr may contain credentials and is never persisted.
  child.stderr.on('data', () => undefined);
  const stop = (): Promise<{ stopped: boolean }> => stopping ??= (async () => {
    if (stopped) {
      if (!treeConfirmed) throw new RelayError('environment', 'A raiz terminou sem confirmação dos descendentes; nenhuma nova tentativa será iniciada.');
      return { stopped: true };
    }
    const pid = child.pid;
    let treeStopped = !options.treeRequired;
    if (pid && process.platform === 'win32') {
      treeStopped = await new Promise<boolean>(resolve => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
        killer.once('close', code => resolve(code === 0)); killer.once('error', () => resolve(false));
      });
      treeConfirmed = treeStopped;
      if (!treeStopped) child.kill();
    } else if (pid) child.kill('SIGKILL');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(resolve, 10_000); })]); }
    finally { if (timer) clearTimeout(timer); }
    if (!stopped) throw new RelayError('environment', 'Não foi possível confirmar o encerramento do processo próprio.');
    if (options.treeRequired && !treeStopped) throw new RelayError('environment', 'Processo encerrou, mas a árvore não pôde ser confirmada.');
    return { stopped: true };
  })();
  // A failed Windows spawn can report pipe errors separately from child.error.
  // Keep these from crashing the coordinator; terminate only this owned tree.
  for (const pipe of [child.stdin, child.stdout, child.stderr])
    pipe.on('error', () => { void stop().catch(() => undefined); });
  return { child, get stopped() { return stopped; }, exited, stop };
}
