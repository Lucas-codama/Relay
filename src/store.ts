import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CredentialRecord, SessionStore } from './contracts.js';
import { RelayError, record, textField } from './errors.js';

const helperPath = fileURLToPath(new URL('../../src/windows-store.ps1', import.meta.url));
const idPattern = /^[a-f0-9]{64}$/;
export interface RelaySessionStore extends SessionStore {
  readonly root: string;
  getHostId(): Promise<string>;
  invalidate(id: string): Promise<void>;
  setLabel(id: string, label: string): Promise<void>;
}
export function registrationId(issuer: string, subject: string, clientId: string): string {
  [issuer, subject, clientId].forEach(value => textField(value, 2048));
  return createHash('sha256').update(JSON.stringify([issuer, subject, clientId])).digest('hex');
}
function assertId(id: string): void {
  if (!idPattern.test(id)) throw new RelayError('integrity', 'Identificador de registro inválido.');
}
function parseCredential(value: unknown, expectedId: string): CredentialRecord {
  const item = record(value);
  const keys = ['registrationId', 'issuer', 'subject', 'clientId', 'hostId', 'accessToken', 'refreshToken', 'idToken', 'expiresAt', 'scopes'];
  if (Object.keys(item).sort().join() !== keys.sort().join()) throw new RelayError('integrity', 'Registro de sessão inválido.');
  for (const key of ['issuer', 'subject', 'clientId', 'hostId']) textField(item[key], 2048);
  for (const key of ['accessToken', 'refreshToken', 'idToken']) {
    if (typeof item[key] !== 'string' || Buffer.byteLength(item[key]) > 65536 || /[\x00-\x1f]/.test(item[key]))
      throw new RelayError('integrity', 'Credencial inválida.');
  }
  if (item.registrationId !== expectedId || registrationId(item.issuer as string, item.subject as string, item.clientId as string) !== expectedId ||
      item.clientId === 'dynamic_agent_client' || typeof item.expiresAt !== 'number' || !Number.isFinite(item.expiresAt) || item.expiresAt < 0 ||
      !Array.isArray(item.scopes) || item.scopes.some(scope => typeof scope !== 'string' || !/^[a-zA-Z0-9._:/-]+$/.test(scope)))
    throw new RelayError('integrity', 'Vínculo de identidade ou validade de sessão inválido.');
  return item as unknown as CredentialRecord;
}
async function plainPath(path: string): Promise<void> {
  let cursor = path;
  while (true) {
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || info.nlink > 1 && info.isFile()) throw new RelayError('integrity', 'Caminho de estado redirecionado.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
async function helper(root: string, name: string, operation: 'read' | 'write', data?: unknown): Promise<unknown> {
  if (process.platform !== 'win32') throw new RelayError('environment', 'O armazenamento protegido deste protótipo exige Windows.');
  await plainPath(root);
  await plainPath(join(root, name));
  return new Promise((accept, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', helperPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let rejected = false;
    const fail = () => { if (!rejected) { rejected = true; reject(new RelayError('integrity', 'Estado Relay indisponível ou sem proteção segura.')); } };
    const timer = setTimeout(() => { child.kill(); fail(); }, 15000);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (Buffer.byteLength(output) > 1048576) { child.kill(); fail(); } });
    child.stderr.on('data', () => {});
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', code => {
      clearTimeout(timer);
      if (rejected) return;
      if (code !== 0) return fail();
      try { accept(JSON.parse(output)); } catch { fail(); }
    });
    child.stdin.end(`${JSON.stringify({ root, name, operation, data })}\n`);
  });
}
async function lock(root: string, name: string): Promise<() => Promise<void>> {
  if (process.platform !== 'win32') throw new RelayError('environment', 'O armazenamento protegido deste protótipo exige Windows.');
  await plainPath(root); await plainPath(join(root, name));
  return new Promise((accept, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', helperPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let ready = false; let releasing = false; let closedCode: number | null | undefined;
    const failed = () => new RelayError('integrity', 'O bloqueio protegido do estado Relay foi perdido ou recusado.');
    const closed = new Promise<void>(resolveClosed => child.once('close', code => { closedCode = code; resolveClosed(); }));
    const timer = setTimeout(() => { child.kill(); reject(new RelayError('environment', 'Registro ocupado; nenhuma renovação concorrente foi iniciada.')); }, 15000);
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(failed()); });
    child.stdin.on('error', () => { if (!ready) reject(failed()); });
    child.on('close', () => { clearTimeout(timer); if (!ready) reject(failed()); });
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > 128 || ready && output.trim() !== '{"locked":true}') { child.kill(); if (!ready) reject(failed()); return; }
      if (!ready && output.includes('\n')) {
        if (output.trim() !== '{"locked":true}') { child.kill(); reject(failed()); return; }
        ready = true; clearTimeout(timer);
        accept(async () => {
          if (releasing) throw failed();
          releasing = true;
          if (closedCode !== undefined) throw failed();
          child.stdin.end('release\n');
          const shutdown = setTimeout(() => child.kill(), 5000);
          await closed; clearTimeout(shutdown);
          if (closedCode !== 0) throw failed();
        });
      }
    });
    child.stdin.write(`${JSON.stringify({ root, name, operation: 'lock' })}\n`);
  });
}
export function createSessionStore(root: string): RelaySessionStore {
  const absolute = resolve(root);
  async function read(id: string): Promise<CredentialRecord | null> {
    assertId(id);
    const value = await helper(absolute, `${id}.json`, 'read');
    return value === null ? null : parseCredential(value, id);
  }
  async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (id !== 'host' && id !== 'labels') assertId(id);
    const release = await lock(absolute, `${id}.lock`);
    try { return await fn(); }
    finally { await release(); }
  }
  const store: RelaySessionStore = {
    root: absolute, read, withLock,
    async write(value) {
      assertId(value.registrationId);
      const parsed = parseCredential(value, value.registrationId);
      const existing = await read(parsed.registrationId);
      if (existing && (existing.hostId !== parsed.hostId || existing.issuer !== parsed.issuer || existing.subject !== parsed.subject || existing.clientId !== parsed.clientId))
        throw new RelayError('integrity', 'Substituição de identidade recusada.');
      await helper(absolute, `${parsed.registrationId}.json`, 'write', parsed);
    },
    async listRegistrations() {
      await helper(absolute, 'host.json', 'read');
      const labels = record(await helper(absolute, 'labels.json', 'read') ?? {});
      const names = await readdir(absolute);
      const result = [];
      for (const name of names.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort()) {
        const id = name.slice(0, -5);
        await read(id);
        const label = labels[id] === undefined ? `Conta ${id.slice(0, 8)}` : textField(labels[id], 80);
        result.push({ id, label });
      }
      return result;
    },
    async getHostId() {
      return withLock('host', async () => {
        const saved = await helper(absolute, 'host.json', 'read');
        if (saved !== null) {
          const value = record(saved);
          if (typeof value.hostId !== 'string' || !/^urn:uuid:[0-9a-f-]{36}$/.test(value.hostId)) throw new RelayError('integrity', 'Host ID inválido.');
          return value.hostId;
        }
        const hostId = `urn:uuid:${randomUUID()}`;
        await helper(absolute, 'host.json', 'write', { hostId });
        return hostId;
      });
    },
    async invalidate(id) {
      const value = await read(id);
      if (value) await store.write({ ...value, accessToken: '', refreshToken: '', idToken: '', expiresAt: 0, scopes: [] });
    },
    async setLabel(id, label) {
      assertId(id); textField(label, 80);
      if (!await read(id)) throw new RelayError('access', 'Registro não encontrado.');
      await withLock('labels', async () => {
        const labels = record(await helper(absolute, 'labels.json', 'read') ?? {});
        await helper(absolute, 'labels.json', 'write', { ...labels, [id]: label });
      });
    },
  };
  return store;
}
