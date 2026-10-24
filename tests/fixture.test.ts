import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { assertRegular, createFixture, applyCandidate, hash } from '../src/fixture.js';
test('cópia exclusiva, hash e substituição mais curta', async () => {
  const f = await createFixture(), source = await readFile(f.sourcePath, 'utf8');
  await applyCandidate(f.sourcePath, 'short', hash(source));
  assert.equal(await readFile(f.sourcePath, 'utf8'), 'short');
  await assert.rejects(applyCandidate(f.sourcePath, 'other', f.initialHash), /alterada/);
});
test('junction no ancestral é recusada', { skip: process.platform !== 'win32' }, async () => {
  const base = resolve('.local'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'test-owned-path-'));
  const real = join(root, 'real'), link = join(root, 'link');
  try {
    await mkdir(real); await writeFile(join(real, 'data'), 'synthetic'); await symlink(real, link, 'junction');
    await assert.rejects(assertRegular(join(link, 'data')), /redirecionado/);
    await rm(link);
  } finally { assert.ok(root.startsWith(join(base, 'test-owned-path-'))); await rm(root, { recursive: true, force: true }); }
});
