import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink, link, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createWorkspace, safeRelativePath, selectContext } from '../src/workspace.js';

async function fixture(run: (root: string, state: string) => Promise<void>): Promise<void> {
  const parent = path.resolve('.local');
  await mkdir(parent, { recursive: true });
  const owned = await mkdtemp(path.join(parent, 'test-owned-workspace-'));
  const root = path.join(owned, 'project'), state = path.join(owned, 'state');
  await mkdir(root);
  try { await run(root, state); }
  finally {
    const checked = path.resolve(owned);
    assert.equal(path.dirname(checked), parent);
    assert.ok(path.basename(checked).startsWith('test-owned-workspace-'));
    await rm(checked, { recursive: true, force: true });
  }
}

test('workspace rejects traversal, Windows aliases, private paths and ADS', () => {
  for (const bad of ['../a', '/a', 'C:/a', 'a\\b', 'a//b', 'a/../b', 'CON.js', 'lpt1', 'a.', 'a ', 'a:b', '.env.example', 'keys/private.pem', '.git/config', '.codex/config.toml', 'auth.json', 'state/file', 'credentials.json']) assert.throws(() => safeRelativePath(bad), bad);
  assert.equal(safeRelativePath('src/calculate-discount.ts'), 'src/calculate-discount.ts');
});

test('snapshot excludes ignored, credentials, binary and oversized files without opening them', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, '.gitignore'), '*.private\ncache/\n');
  await writeFile(path.join(root, '.env'), 'secret');
  await writeFile(path.join(root, 'credentials.json'), 'secret');
  await writeFile(path.join(root, 'a.private'), 'secret');
  await mkdir(path.join(root, 'cache')); await writeFile(path.join(root, 'cache', 'a'), 'private');
  await writeFile(path.join(root, 'binary'), Buffer.from([0, 1, 2]));
  await writeFile(path.join(root, 'large'), 'x'.repeat(65537));
  await writeFile(path.join(root, 'main.ts'), 'export const answer = 42;');
  const result = await createWorkspace(root, state).snapshot();
  assert.deepEqual(result.files.map(file => file.path), ['.gitignore', 'main.ts']);
  assert.ok(result.omitted >= 6);
}));

test('SSH directories and private key basenames never enter context or backups', async () => fixture(async (root, state) => {
  await mkdir(path.join(root, '.ssh'));
  for (const relative of ['.ssh/id_ecdsa', '.ssh/config', 'id_ecdsa', 'id_dsa', 'id_ecdsa.backup', 'id_dsa.old']) {
    await writeFile(path.join(root, ...relative.split('/')), 'SYNTHETIC PRIVATE KEY NOT A REAL SECRET');
  }
  await writeFile(path.join(root, 'main.ts'), 'public source');
  const workspace = createWorkspace(root, state);
  const snapshot = await workspace.snapshot();
  assert.deepEqual(snapshot.files.map(file => file.path), ['main.ts']);
  assert.ok(!JSON.stringify(selectContext(snapshot, 'show SSH id_ecdsa')).includes('SYNTHETIC PRIVATE'));
  for (const relative of ['.ssh/id_ecdsa', 'id_ecdsa', 'id_dsa', 'id_ecdsa.backup']) {
    await assert.rejects(workspace.apply([{ path: relative, before: 'SYNTHETIC', after: 'changed' }]), /privado/iu);
  }
  await assert.rejects(readdir(path.join(state, 'backups')), { code: 'ENOENT' });
}));

test('snapshot and apply reject junctions and hardlinks', async () => fixture(async (root, state) => {
  const external = path.join(path.dirname(root), 'external'); await mkdir(external);
  await writeFile(path.join(external, 'file'), 'protected');
  const junction = path.join(root, 'alias');
  await symlink(external, junction, 'junction');
  const workspace = createWorkspace(root, state);
  await assert.rejects(workspace.snapshot(), /link/iu);
  await assert.rejects(workspace.apply([{ path: 'alias/file', before: 'protected', after: 'changed' }]), /link/iu);
  assert.equal(await readFile(path.join(external, 'file'), 'utf8'), 'protected');
  await rm(junction);
  await link(path.join(external, 'file'), path.join(root, 'hard'));
  await assert.rejects(workspace.snapshot(), /link/iu);
}));

test('apply creates and replaces unique snippets, backup undo restores owned changes', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'main.ts'), 'export const value = 1;');
  const workspace = createWorkspace(root, state);
  const result = await workspace.apply([{ path: 'main.ts', before: 'value = 1', after: 'value = 2' }, { path: 'src/new.ts', before: '', after: 'export {};' }]);
  assert.deepEqual(result.changed, ['main.ts', 'src/new.ts']);
  assert.equal(await readFile(path.join(root, 'main.ts'), 'utf8'), 'export const value = 2;');
  assert.deepEqual(await workspace.undo(result.backupId), result.changed);
  assert.equal(await readFile(path.join(root, 'main.ts'), 'utf8'), 'export const value = 1;');
  await assert.rejects(readFile(path.join(root, 'src/new.ts')), { code: 'ENOENT' });
}));

test('preflight rejects all edits together, duplicates, ambiguous matches and empty existing files', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'a.ts'), 'same same');
  await writeFile(path.join(root, 'empty.ts'), '');
  const workspace = createWorkspace(root, state);
  await assert.rejects(workspace.apply([{ path: 'new.ts', before: '', after: 'new' }, { path: 'a.ts', before: 'same', after: 'different' }]), /exatamente/iu);
  await assert.rejects(readFile(path.join(root, 'new.ts')), { code: 'ENOENT' });
  await assert.rejects(workspace.apply([{ path: 'empty.ts', before: '', after: 'new' }]), /existente/iu);
  await assert.rejects(workspace.apply([{ path: 'a.ts', before: 'same same', after: 'a' }, { path: 'a.ts', before: 'same same', after: 'b' }]), /uma alteração/iu);
  assert.equal(await readFile(path.join(root, 'a.ts'), 'utf8'), 'same same');
}));

test('repair restricts exact paths and preserves passed tests and unrelated files', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'failed.ts'), 'bug');
  await writeFile(path.join(root, 'passed.test.ts'), 'passing');
  const workspace = createWorkspace(root, state);
  await assert.rejects(workspace.apply([{ path: 'failed.ts', before: 'bug', after: 'fixed' }, { path: 'passed.test.ts', before: 'passing', after: 'changed' }], ['failed.ts']), /fora/iu);
  assert.equal(await readFile(path.join(root, 'failed.ts'), 'utf8'), 'bug');
  await workspace.apply([{ path: 'failed.ts', before: 'bug', after: 'fixed' }], ['failed.ts']);
  assert.equal(await readFile(path.join(root, 'passed.test.ts'), 'utf8'), 'passing');
}));

test('undo detects concurrent user edits before restoring any file', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'a.ts'), 'old-a'); await writeFile(path.join(root, 'b.ts'), 'old-b');
  const workspace = createWorkspace(root, state);
  const result = await workspace.apply([{ path: 'a.ts', before: 'old-a', after: 'relay-a' }, { path: 'b.ts', before: 'old-b', after: 'relay-b' }]);
  await writeFile(path.join(root, 'b.ts'), 'user-b');
  await assert.rejects(workspace.undo(result.backupId), /usuário/iu);
  assert.equal(await readFile(path.join(root, 'a.ts'), 'utf8'), 'relay-a');
  assert.equal(await readFile(path.join(root, 'b.ts'), 'utf8'), 'user-b');
}));

test('undo resumes an interrupted restoration and is idempotent for restored and removed files', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'a.ts'), 'old-a'); await writeFile(path.join(root, 'b.ts'), 'old-b');
  const workspace = createWorkspace(root, state);
  const result = await workspace.apply([
    { path: 'a.ts', before: 'old-a', after: 'relay-a' },
    { path: 'new.ts', before: '', after: 'created' },
    { path: 'b.ts', before: 'old-b', after: 'relay-b' }
  ]);
  // Simulate interruption after the first two disk operations of undo.
  await writeFile(path.join(root, 'a.ts'), 'old-a');
  await rm(path.join(root, 'new.ts'));
  assert.deepEqual(await workspace.undo(result.backupId), result.changed);
  assert.equal(await readFile(path.join(root, 'a.ts'), 'utf8'), 'old-a');
  assert.equal(await readFile(path.join(root, 'b.ts'), 'utf8'), 'old-b');
  await assert.rejects(readFile(path.join(root, 'new.ts')), { code: 'ENOENT' });
  assert.deepEqual(await workspace.undo(result.backupId), result.changed);
}));

test('interrupted undo still refuses a third state and preserves user edits', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, 'a.ts'), 'old-a'); await writeFile(path.join(root, 'b.ts'), 'old-b');
  const workspace = createWorkspace(root, state);
  const result = await workspace.apply([{ path: 'a.ts', before: 'old-a', after: 'relay-a' }, { path: 'b.ts', before: 'old-b', after: 'relay-b' }]);
  await writeFile(path.join(root, 'a.ts'), 'old-a');
  await writeFile(path.join(root, 'b.ts'), 'user edit after interrupted undo');
  await assert.rejects(workspace.undo(result.backupId), /usuário/iu);
  assert.equal(await readFile(path.join(root, 'a.ts'), 'utf8'), 'old-a');
  assert.equal(await readFile(path.join(root, 'b.ts'), 'utf8'), 'user edit after interrupted undo');
}));

test('apply respects root ignore rules and backup identifiers cannot escape state', async () => fixture(async (root, state) => {
  await writeFile(path.join(root, '.gitignore'), 'private/\n*.local\n');
  const workspace = createWorkspace(root, state);
  await assert.rejects(workspace.apply([{ path: 'private/new.ts', before: '', after: 'x' }]), /ignorado/iu);
  await assert.rejects(workspace.undo('../anything'));
  assert.deepEqual(await readdir(root), ['.gitignore']);
}));

test('nested ignore rules are private and cannot be changed by model edits', async () => fixture(async (root, state) => {
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', '.gitignore'), '*.private\n');
  await writeFile(path.join(root, 'src', 'data.private'), 'private');
  await writeFile(path.join(root, 'src', 'good.ts'), 'good');
  const workspace = createWorkspace(root, state);
  assert.ok(!(await workspace.snapshot()).files.some(file => file.path.endsWith('.private')));
  await assert.rejects(workspace.apply([{ path: 'src/data.private', before: 'private', after: 'changed' }]), /ignorado/iu);
  await assert.rejects(workspace.apply([{ path: 'src/.gitignore', before: '*.private', after: '' }]), /privacidade/iu);
}));

test('snapshot file count and UTF8 byte limits bound project input', async () => fixture(async (root, state) => {
  await Promise.all(Array.from({ length: 405 }, (_, index) => writeFile(path.join(root, `${index}.txt`), 'x')));
  const snapshot = await createWorkspace(root, state).snapshot();
  assert.equal(snapshot.files.length, 400);
  assert.equal(snapshot.omitted, 5);
}));

test('context prioritizes failed source, local imports, manifests and named files with actual bytes', () => {
  const files = [
    { path: 'src/fail.ts', content: "import { helper } from './helper.js';\nexport const value = helper();", hash: 'a' },
    { path: 'src/helper.ts', content: 'export const helper = () => 1;', hash: 'b' },
    { path: 'README.md', content: 'Small project', hash: 'c' },
    { path: 'package.json', content: '{}', hash: 'd' },
    { path: 'unrelated.txt', content: 'x'.repeat(1000), hash: 'e' }
  ];
  const result = selectContext({ root: '.', files, omitted: 2 }, 'Fix failing feature', ['src/fail.ts'], 500);
  assert.deepEqual(result.files.map(file => file.path).sort(), ['README.md', 'package.json', 'src/fail.ts', 'src/helper.ts'].sort());
  assert.equal(result.bytes, result.files.reduce((sum, file) => sum + Buffer.byteLength(JSON.stringify({ path: file.path, content: file.content })), 0));
  assert.ok(result.bytes < result.fullBytes);
  assert.equal(result.omitted, 3);
  assert.equal(selectContext({ root: '.', files, omitted: 0 }, '', [], 1).files.length, 0);
});
