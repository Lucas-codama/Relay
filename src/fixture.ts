import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { RelayError } from './errors.js';
export const initialSource = () => readFile(new URL('../../fixtures/discount/discount.mjs', import.meta.url), 'utf8');
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export async function assertRegular(path: string): Promise<void> {
  // MSIX may canonicalize LOCALAPPDATA into its package cache without a reparse
  // point. Reject actual links in every ancestor instead of comparing spellings.
  let cursor = resolve(path);
  while (true) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || info.isFile() && info.nlink > 1)
      throw new RelayError('integrity', 'Caminho redirecionado recusado.');
    const parent = dirname(cursor); if (parent === cursor) return; cursor = parent;
  }
}
export async function createFixture(): Promise<{ root: string; sourcePath: string; initialHash: string }> {
  const root = join(tmpdir(), 'relay-demo-' + randomUUID());
  await mkdir(root); await assertRegular(root);
  const sourcePath = join(root, 'discount.mjs'), source = await initialSource();
  await writeFile(sourcePath, source, { flag: 'wx' });
  return { root, sourcePath, initialHash: hash(source) };
}
export async function applyCandidate(path: string, source: string, previousHash: string): Promise<void> {
  await assertRegular(path);
  if (hash(await readFile(path, 'utf8')) !== previousHash) throw new RelayError('integrity', 'A cópia foi alterada por outro processo.');
  await writeFile(path, source, { flag: 'r+' });
  // r+ alone does not truncate a shorter replacement.
  const { truncate } = await import('node:fs/promises'); await truncate(path, Buffer.byteLength(source));
  if (hash(await readFile(path, 'utf8')) !== hash(source)) throw new RelayError('integrity', 'Escrita do candidato não foi confirmada.');
}
