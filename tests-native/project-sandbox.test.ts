import test from 'node:test'; import assert from 'node:assert/strict'; import { resolve, join } from 'node:path';
import { NativeProjectChecker } from '../src/project-sandbox.js';
import type { ProjectSnapshot } from '../src/project-types.js';
test('perfil mínimo MXC executa testes de vários arquivos sem ler credenciais ou escrever no projeto', { timeout: 60_000 }, async () => {
  const files = [
    { path: 'package.json', content: '{"type":"module"}', hash: 'x' },
    { path: 'src/add.js', content: 'export const add=(a,b)=>a+b;', hash: 'x' },
    { path: 'tests/add.test.js', content: 'import test from "node:test";import assert from "node:assert/strict";import {add} from "../src/add.js";test("adds",()=>assert.equal(add(2,3),5));', hash: 'x' },
  ];
  const snapshot: ProjectSnapshot = { root: '.', files, omitted: 0 };
  const checker = new NativeProjectChecker(resolve('.local/project-native-tests'), files.filter(f => f.path === 'tests/add.test.js'));
  const good = await checker.check(snapshot, AbortSignal.timeout(25_000)); assert.equal(good.status, 'passed', good.diagnostic); assert.equal(good.tests, 1); assert.equal(good.trusted, true); assert.equal(good.passed, 1); assert.equal(good.failed, 0);
  const bad = await checker.check({ ...snapshot, files: files.map(f => f.path === 'src/add.js' ? { ...f, content: 'export const add=(a,b)=>a-b;' } : f) }, AbortSignal.timeout(25_000));
  assert.equal(bad.failure, 'implementation'); assert.equal(bad.passed, 0); assert.equal(bad.failed, 1); assert.ok(bad.failedFiles.includes('tests/add.test.js'));
  const virtualized = new NativeProjectChecker(join(process.env.LOCALAPPDATA!, 'Relay', 'native-project-regression'), files.filter(f => f.path === 'tests/add.test.js'));
  const msix = await virtualized.check(snapshot, AbortSignal.timeout(25_000)); assert.equal(msix.status, 'passed', msix.diagnostic);
  const changedTests = await virtualized.check({ ...snapshot, files: files.map(f => f.path === 'tests/add.test.js' ? { ...f, content: f.content + '\n// changed evaluator' } : f) }, AbortSignal.timeout(25_000));
  assert.equal(changedTests.status, 'passed'); assert.equal(changedTests.trusted, false);
  const nested = [...files.filter(f => !f.path.endsWith('.test.js')),
    { path: 'src/cli.js', content: 'console.log(7);', hash: 'x' },
    { path: 'tests/child.test.js', content: 'import test from "node:test";import assert from "node:assert/strict";import {spawnSync} from "node:child_process";test("nested Node",()=>{const r=spawnSync(process.execPath,["src/cli.js"],{encoding:"utf8"});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),"7");});', hash: 'x' }];
  const child = await checker.check({ ...snapshot, files: nested }, AbortSignal.timeout(25_000));
  assert.equal(child.status, 'passed', child.diagnostic);
});
