import { resolve } from 'node:path';
import { ownProcess } from './processes.js';
import { startServer, readRequirements, VERIFIED_CODEX, RELAY_VERSION } from './app-server.js';
import { NativeSandbox } from './sandbox.js';
import { RelayError } from './errors.js';
import type { Versions } from './contracts.js';
export async function capture(command: string, args: string[], signal: AbortSignal): Promise<string> {
  const owner = ownProcess(command, args); let output = '';
  owner.child.stdout.on('data', (b: Buffer) => { output += b.toString('utf8'); if (Buffer.byteLength(output) > 16384) void owner.stop(); });
  const abort = () => { void owner.stop(); }; signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) abort(); await owner.exited;
    if (signal.aborted || owner.child.exitCode !== 0 || Buffer.byteLength(output) > 16384) throw new RelayError('environment', 'Executável indisponível ou versão não verificável: ' + command);
    return output.trim();
  } finally { signal.removeEventListener('abort', abort); await owner.stop(); }
}
export async function versions(signal: AbortSignal): Promise<Versions> {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || (minor ?? 0) < 18) throw new RelayError('environment', 'Use Node 24.18.0 ou atualização compatível da linha 24.');
  const codex = (await capture('codex', ['--version'], signal)).match(/codex-cli ([\w.+-]+)/)?.[1];
  if (codex !== VERIFIED_CODEX) throw new RelayError('environment', 'Versão do Codex diferente da validada; confira schema antes de inferência.');
  const pwsh = await capture('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], signal);
  if (Number(pwsh.split('.')[0]) < 7) throw new RelayError('environment', 'Use PowerShell 7 ou superior.');
  await capture('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '& npm --version'], signal);
  return { relay: RELAY_VERSION, node: process.version, codex };
}
export async function doctor(stateRoot: string, signal: AbortSignal): Promise<string> {
  const v = await versions(signal);
  const rpc = await startServer({ home: resolve(stateRoot, 'doctor-codex'), cwd: process.cwd() }, signal);
  let managed = false;
  try { managed = await readRequirements(rpc, signal) !== null; } finally { await rpc.close(); }
  if (managed) throw new RelayError('environment', 'Requisitos gerenciados precisam de validação específica.');
  const sandbox = new NativeSandbox(resolve(stateRoot, 'native'));
  await sandbox.preflight(signal);
  return `Relay ${v.relay}; Node ${v.node}; Codex ${v.codex}\nHandshake: OK. Sandbox: escrita/rede bloqueadas na prova local.\nEste diagnóstico não testa login nem acesso a modelos.\n`;
}
