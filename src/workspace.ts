import { constants } from 'node:fs';
import { mkdir, lstat, readdir, open, rename, unlink, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Edit, ProjectFile, ProjectSnapshot, Workspace } from './project-types.js';
import { RelayError } from './errors.js';

const FILE_LIMIT = 64 * 1024;
const TOTAL_LIMIT = 1024 * 1024;
const excluded = new Set(['.git', '.codex', '.agents', '.aws', '.ssh', 'node_modules', 'dist', 'build', '.relay', '.local', '.venv', '__pycache__']);
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const bytes = (file: ProjectFile): number => Buffer.byteLength(JSON.stringify({ path: file.path, content: file.content }));

export function safeRelativePath(input: string): string {
  if (typeof input !== 'string' || !input || input.length > 240 || input.includes('\\') || input.includes(':') || input.includes('\0') || input.startsWith('/') || input.includes('//')) throw new Error('Caminho relativo inválido.');
  const parts = input.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[<>"|?*\x00-\x1f]/u.test(p) || /[. ]$/u.test(p) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(p))) throw new Error('Caminho inseguro ou reservado.');
  if (parts.some(p => excluded.has(p.toLowerCase()) || p.toLowerCase() === 'state' || /^\.env/iu.test(p) || /\.(pem|key|pfx|p12)$/iu.test(p) || /^(?:\.npmrc|\.netrc|\.git-credentials|id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:$|[._-])/iu.test(p) || /^(auth|credentials|secrets?)(?:[._-]|$)/iu.test(p))) throw new Error('Arquivo privado ou gerado fora do escopo.');
  return input;
}

async function assertChain(target: string, allowMissing: boolean): Promise<void> {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error('Links simbólicos, junctions e hardlinks não são permitidos.');
    } catch (error) {
      if (allowMissing && isMissing(error)) return;
      throw error;
    }
  }
}
function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

async function readText(filename: string): Promise<string> {
  await assertChain(filename, false);
  const before = await lstat(filename);
  if (!before.isFile() || before.size > FILE_LIMIT) throw new Error('Arquivo não textual ou acima de 64 KiB.');
  const handle = await open(filename, constants.O_RDONLY);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.nlink > 1 || actual.size > FILE_LIMIT || actual.ino !== before.ino) throw new Error('Arquivo mudou durante a leitura.');
    const buffer = Buffer.alloc(FILE_LIMIT + 1);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead > FILE_LIMIT) throw new Error('Arquivo acima de 64 KiB.');
    const data = buffer.subarray(0, result.bytesRead);
    if (data.includes(0)) throw new Error('Arquivo binário.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (/[\x01-\x08\x0e-\x1f]/u.test(text)) throw new Error('Arquivo binário.');
    return text;
  } finally { await handle.close(); }
}

interface IgnoreRule { expression: RegExp; negate: boolean; directory: boolean }
function ignoreRules(text: string, base = ''): IgnoreRule[] {
  return text.split(/\r?\n/u).flatMap(line => {
    let value = line.trim();
    if (!value || value.startsWith('#')) return [];
    const negate = value.startsWith('!');
    if (negate) value = value.slice(1);
    // Advanced escaped/class patterns are conservatively private rather than
    // approximated in a way that could disclose an ignored file.
    if (/[\\[\]]/u.test(value)) {
      if (negate) return [];
      const escapedBase = base.replace(/[\\^$+.()|{}[\]]/gu, '\\$&');
      return [{ expression: new RegExp(base ? `^${escapedBase}/` : '^', 'iu'), negate: false, directory: true }];
    }
    const directory = value.endsWith('/');
    value = value.replace(/^\//u, '').replace(/\/$/u, '');
    if (!value) return [];
    const anchored = line.startsWith('/') || value.includes('/');
    let pattern = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i]!;
      if (char === '*' && value[i + 1] === '*' && value[i + 2] === '/') { pattern += '(?:.*/)?'; i += 2; }
      else if (char === '*' && value[i + 1] === '*') { pattern += '.*'; i++; }
      else if (char === '*') pattern += '[^/]*';
      else if (char === '?') pattern += '[^/]';
      else pattern += char.replace(/[\\^$+.()|{}[\]]/gu, '\\$&');
    }
    const basePattern = base.replace(/[\\^$+.()|{}[\]]/gu, '\\$&');
    const prefix = base ? `^${basePattern}/${anchored ? '' : '(?:.*/)?'}` : anchored ? '^' : '(?:^|/)';
    return [{ expression: new RegExp(`${prefix}${pattern}(?:$|/)`, 'iu'), negate, directory }];
  });
}
function ignored(relative: string, rules: IgnoreRule[]): boolean {
  let result = false;
  for (const rule of rules) if (rule.expression.test(relative)) result = !rule.negate;
  return result;
}

interface BackupFile { path: string; before: string | null; afterHash: string }
interface Backup { version: 1; root: string; files: BackupFile[] }

export function createWorkspace(root: string, stateRoot: string): Workspace {
  const absoluteRoot = path.resolve(root);
  const absoluteState = path.resolve(stateRoot);
  async function initialize(): Promise<IgnoreRule[]> {
    await assertChain(absoluteRoot, false);
    // MSIX virtualizes LOCALAPPDATA without a reparse point. assertChain rejects
    // actual links in every ancestor without requiring identical path spellings.
    await assertChain(absoluteState, true);
    try { return ignoreRules(await readText(path.join(absoluteRoot, '.gitignore'))); }
    catch (error) { if (isMissing(error)) return []; throw error; }
  }
  function filename(relative: string): string { return path.join(absoluteRoot, ...safeRelativePath(relative).split('/')); }
  async function writable(relative: string, rules: IgnoreRule[]): Promise<string> {
    const target = filename(relative);
    if (relative.split('/').some(segment => segment.toLowerCase() === '.gitignore')) throw new Error('Regras de privacidade não podem ser alteradas pelo modelo.');
    const scoped = [...rules];
    const segments = relative.split('/');
    for (let count = 1; count < segments.length; count++) {
      const parent = segments.slice(0, count).join('/');
      if (ignored(parent, scoped)) throw new Error('Diretório ignorado fora do escopo.');
      try { scoped.push(...ignoreRules(await readText(path.join(absoluteRoot, ...segments.slice(0, count), '.gitignore')), parent)); }
      catch (error) { if (!isMissing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
    }
    if (ignored(relative, scoped)) throw new Error('Arquivo ignorado fora do escopo.');
    if (target === absoluteState || target.startsWith(absoluteState + path.sep)) throw new Error('Estado do Relay fora do escopo.');
    await assertChain(target, true);
    return target;
  }
  async function replace(target: string, content: string): Promise<void> {
    await assertChain(target, true);
    await mkdir(path.dirname(target), { recursive: true });
    await assertChain(path.dirname(target), false);
    const temporary = path.join(path.dirname(target), `.relay-write-${randomUUID()}.tmp`);
    try { await writeFile(temporary, content, { flag: 'wx', mode: 0o600 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(error => { if (!isMissing(error)) throw error; }); }
  }
  async function current(target: string): Promise<string | null> {
    try { return await readText(target); } catch (error) { if (isMissing(error)) return null; throw error; }
  }
  return {
    async snapshot() {
      const rules = await initialize();
      const files: ProjectFile[] = [];
      let omitted = 0, size = 0;
      async function walk(directory: string, prefix: string, inherited: IgnoreRule[]): Promise<void> {
        const scoped = [...inherited];
        if (prefix && !ignored(`${prefix}/.gitignore`, scoped)) {
          try { scoped.push(...ignoreRules(await readText(path.join(directory, '.gitignore')), prefix)); }
          catch (error) { if (!isMissing(error)) throw error; }
        }
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          try { safeRelativePath(relative); } catch { omitted++; continue; }
          if (ignored(relative, scoped) || path.join(directory, entry.name) === absoluteState) { omitted++; continue; }
          const target = path.join(directory, entry.name);
          const stat = await lstat(target);
          if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error('Árvore contém link; remova-o do escopo antes de continuar.');
          if (stat.isDirectory()) await walk(target, relative, scoped);
          else if (stat.isFile()) {
            if (files.length >= 400 || stat.size > FILE_LIMIT || size + stat.size > TOTAL_LIMIT) { omitted++; continue; }
            let content: string;
            try { content = await readText(target); } catch (error) {
              if ((error as Error).message.includes('binário') || (error as Error).message.includes('textual') || error instanceof TypeError) { omitted++; continue; }
              throw error;
            }
            size += Buffer.byteLength(content); files.push({ path: relative, content, hash: digest(content) });
          } else omitted++;
        }
      }
      await walk(absoluteRoot, '', rules);
      return { root: absoluteRoot, files, omitted };
    },
    async apply(edits: Edit[], allowedPaths?: readonly string[]) {
      const rules = await initialize();
      if (!Array.isArray(edits) || edits.length < 1 || edits.length > 24) throw new Error('Informe de 1 a 24 alterações.');
      const allowed = allowedPaths ? new Set(allowedPaths.map(safeRelativePath)) : null;
      const seen = new Set<string>();
      const prepared: { target: string; content: string; record: BackupFile }[] = [];
      for (const edit of edits) {
        const relative = safeRelativePath(edit.path);
        if (seen.has(relative.toLowerCase())) throw new RelayError('implementation', 'Somente uma alteração por arquivo é permitida.');
        seen.add(relative.toLowerCase());
        if (allowed && !allowed.has(relative)) throw new Error('Reparo fora dos arquivos que falharam.');
        if (typeof edit.before !== 'string' || typeof edit.after !== 'string') throw new Error('Alteração inválida.');
        const target = await writable(relative, rules);
        const before = await current(target);
        let content: string;
        // Empty before is creation only, including rejection of an existing empty file.
        if (edit.before === '') {
          if (before !== null) throw new RelayError('implementation', 'Criação não pode sobrescrever arquivo existente.');
          content = edit.after;
        } else {
          if (before === null) throw new RelayError('implementation', 'Arquivo de substituição ausente.');
          const first = before.indexOf(edit.before);
          if (first < 0 || before.indexOf(edit.before, first + 1) >= 0) throw new RelayError('implementation', 'Trecho anterior deve ocorrer exatamente uma vez.');
          content = before.slice(0, first) + edit.after + before.slice(first + edit.before.length);
        }
        if (Buffer.byteLength(content) > FILE_LIMIT || content.includes('\0')) throw new Error('Resultado acima do limite ou binário.');
        prepared.push({ target, content, record: { path: relative, before, afterHash: digest(content) } });
      }
      const backupId = randomUUID();
      const backupDirectory = path.join(absoluteState, 'backups', backupId);
      await assertChain(backupDirectory, true);
      await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
      await assertChain(backupDirectory, false);
      const backup: Backup = { version: 1, root: absoluteRoot, files: prepared.map(item => item.record) };
      await writeFile(path.join(backupDirectory, 'manifest.json'), JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
      const written: typeof prepared = [];
      try {
        for (const item of prepared) {
          if (await current(item.target) !== item.record.before) throw new Error('Conflito: arquivo mudou após a preparação.');
          await replace(item.target, item.content); written.push(item);
        }
      } catch (error) {
        for (const item of written.reverse()) {
          if (digest((await current(item.target)) ?? '') !== item.record.afterHash) continue;
          if (item.record.before === null) await unlink(item.target);
          else await replace(item.target, item.record.before);
        }
        throw error;
      }
      return { backupId, changed: prepared.map(item => item.record.path) };
    },
    async undo(backupId: string) {
      const rules = await initialize();
      if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(backupId)) throw new Error('Identificador de backup inválido.');
      const manifest = path.join(absoluteState, 'backups', backupId, 'manifest.json');
      await assertChain(manifest, false);
      const stat = await lstat(manifest);
      if (stat.size > 12 * TOTAL_LIMIT) throw new Error('Backup inválido.');
      const backup = JSON.parse(await readFile(manifest, 'utf8')) as Backup;
      if (backup.version !== 1 || backup.root !== absoluteRoot || !Array.isArray(backup.files) || backup.files.length > 24) throw new Error('Backup pertence a outro projeto ou é inválido.');
      const seen = new Set<string>();
      const prepared: { target: string; record: BackupFile }[] = [];
      for (const record of backup.files) {
        const target = await writable(record.path, rules);
        if (seen.has(record.path.toLowerCase()) || (record.before !== null && (typeof record.before !== 'string' || Buffer.byteLength(record.before) > FILE_LIMIT)) || !/^[\da-f]{64}$/u.test(record.afterHash)) throw new Error('Registro de backup inválido.');
        seen.add(record.path.toLowerCase());
        const text = await current(target);
        // A prior undo may have stopped after restoring an earlier file. Exact
        // before-content (or an absent file created by Relay) is already done;
        // any third state is a user conflict and blocks the complete preflight.
        if (text !== record.before && (text === null || digest(text) !== record.afterHash)) throw new Error('Conflito: alterações do usuário preservadas; undo cancelado.');
        prepared.push({ target, record });
      }
      for (const item of prepared) {
        const text = await current(item.target);
        if (text === item.record.before) continue;
        if (text === null || digest(text) !== item.record.afterHash) throw new Error('Conflito durante undo; alterações externas preservadas.');
        if (item.record.before === null) await unlink(item.target);
        else await replace(item.target, item.record.before);
      }
      return prepared.map(item => item.record.path);
    }
  };
}

export function selectContext(snapshot: ProjectSnapshot, prompt: string, failedFiles: readonly string[] = [], maxBytes = 24 * 1024, focused = false): { files: ProjectFile[]; bytes: number; fullBytes: number; omitted: number } {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new Error('Orçamento de contexto inválido.');
  const available = new Map(snapshot.files.map(file => [file.path, file]));
  const important = new Set(failedFiles.filter(file => available.has(file)));
  const lower = prompt.toLowerCase();
  const terms = new Set(lower.split(/[^\p{L}\p{N}_-]+/u).filter(term => term.length >= 3));
  for (const file of snapshot.files) if (!focused && lower.includes(file.path.toLowerCase())) important.add(file.path);
  const queue = [...important];
  for (let i = 0; i < queue.length; i++) {
    const file = available.get(queue[i]!);
    if (!file) continue;
    for (const match of file.content.matchAll(/(?:from\s*|import\s*\(|require\s*\(|import\s*)['"](\.[^'"]+)['"]/gu)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[1]!));
      for (const candidate of [base, `${base}.ts`, `${base}.js`, base.replace(/\.js$/u, '.ts'), `${base}/index.ts`, `${base}/index.js`]) {
        if (available.has(candidate) && !important.has(candidate)) { important.add(candidate); queue.push(candidate); }
      }
    }
  }
  function score(file: ProjectFile): number {
    let value = failedFiles.includes(file.path) ? 10000 : important.has(file.path) ? 5000 : 0;
    if (/^(package\.json|readme(?:\.md)?)$/iu.test(file.path) && bytes(file) <= 4096) value += 4000;
    const name = file.path.toLowerCase();
    for (const term of terms) if (name.includes(term)) value += 100;
    return value;
  }
  const sorted = snapshot.files.filter(file => !focused || important.has(file.path) || file.path === 'package.json')
    .sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path));
  const files: ProjectFile[] = [];
  let used = 0;
  for (const file of sorted) { const size = bytes(file); if (used + size <= maxBytes) { files.push(file); used += size; } }
  return { files, bytes: used, fullBytes: snapshot.files.reduce((sum, file) => sum + bytes(file), 0), omitted: snapshot.omitted + snapshot.files.length - files.length };
}
