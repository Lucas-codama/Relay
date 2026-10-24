import { access, readdir, lstat } from 'node:fs/promises';
import { join, dirname, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function plain(path) {
  let cursor = resolve(path);
  while (true) {
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) return false;
    const parent = dirname(cursor); if (parent === cursor) return true; cursor = parent;
  }
}
async function addRuntime(command, candidates, versionPattern) {
  const current = spawnSync(command, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 10_000 });
  if (!current.error) return;
  const versions = [];
  for (const candidate of candidates) {
    if (!await exists(candidate) || !await plain(candidate)) continue;
    const result = spawnSync(candidate, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 10_000 });
    if (result.status === 0 && versionPattern.test(result.stdout.trim())) {
      process.env.PATH = dirname(candidate) + delimiter + (process.env.PATH ?? process.env.Path ?? '');
      return;
    }
    if (result.status === 0) versions.push(result.stdout.trim().slice(0, 100));
  }
  if (versions.length) throw new Error(`${command} instalado com versão diferente da suportada: ${versions.join(', ')}. Atualize o Relay.`);
  throw new Error(`${command} não encontrado. Confira os pré-requisitos no README.`);
}
try {
  const cliPath = join(root, 'dist/src/cli.js');
  if (!await exists(cliPath)) throw new Error('Execute npm run build na pasta do Relay antes de iniciar.');
  const { main } = await import('../dist/src/cli.js');
  if (process.platform === 'win32' && !process.argv.slice(2).some(arg => ['--help', '-h', 'help'].includes(arg))) {
    const { VERIFIED_CODEX } = await import('../dist/src/app-server.js');
    const user = process.env.USERPROFILE, local = process.env.LOCALAPPDATA;
    if (!user || !local) throw new Error('USERPROFILE/LOCALAPPDATA indisponível.');
    await addRuntime('pwsh', [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell/7/pwsh.exe'),
      join(user, '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe')], /^PowerShell 7\./);
    const bin = join(local, 'OpenAI/Codex/bin');
    const dirs = await readdir(bin, { withFileTypes: true }).catch(() => []);
    const candidates = dirs.filter(d => d.isDirectory() && /^[a-f0-9]+$/i.test(d.name)).map(d => join(bin, d.name, 'codex.exe'));
    await addRuntime('codex', candidates, new RegExp('^codex-cli ' + VERIFIED_CODEX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  }
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error('Relay: ' + (error instanceof Error ? error.message : 'Falha ao iniciar.'));
  process.exitCode = 3;
}
