import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('CLI persiste, lista, conclui e preserva arquivo inválido', () => {
  const folder = mkdtempSync(join(tmpdir(), 'relay-tasks-'));
  const file = join(folder, 'tasks.json');
  const cli = (...args) => spawnSync(process.execPath,
    ['--preserve-symlinks', '--preserve-symlinks-main', resolve('src/cli.js'), ...args],
    { env: { ...process.env, RELAY_TASKS_FILE: file }, encoding: 'utf8' });
  const added = cli('add', 'Comprar pão'); assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [{ id: 1, title: 'Comprar pão', done: false }]);
  assert.match(cli('list').stdout, /Comprar pão/);
  assert.equal(cli('done', '1').status, 0);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].done, true);
  assert.notEqual(cli('done', '999').status, 0);
  writeFileSync(file, 'invalid-json'); assert.notEqual(cli('add', 'Outra').status, 0);
  assert.equal(readFileSync(file, 'utf8'), 'invalid-json');
});
