import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { NativeSandbox } from '../src/sandbox.js';
import { createVerifier } from '../src/verify.js';
import { initialSource } from '../src/fixture.js';
test('gate Windows, baseline, referência e candidatos adversos pelo runner completo', { timeout: 120_000 }, async () => {
  const sandbox = new NativeSandbox(resolve('.local/native-tests'));
  const signal = AbortSignal.timeout(110_000);
  await sandbox.preflight(signal);
  const verifier = createVerifier(sandbox), baseline = await initialSource();
  const first = await verifier.verify(baseline, signal);
  assert.equal(first.failure, 'implementation'); assert.equal(first.results.filter(c => c.status === 'failed').length, 3);
  const reference = baseline.replace('Math.floor(percent / 100)', '(percent / 100)');
  assert.equal((await verifier.verify(reference, signal)).status, 'passed');
  assert.equal((await verifier.verify('if(typeof process!=="undefined"||typeof require!=="undefined"||typeof fetch!=="undefined"||typeof console!=="undefined")throw new Error("host");\n' + reference, signal)).status, 'passed');
  assert.notEqual((await verifier.verify('import fs from "node:fs";\n' + reference, signal)).status, 'passed');
  for (const source of [
    'import fs from "node:fs"; export function calculateDiscount(){return 0}',
    'export function calculateDiscount(){return process.env.ACCESS_TOKEN}',
    'export function calculateDiscount(){return fetch("http://127.0.0.1")}',
    'export async function calculateDiscount(){return 0}',
    'export function calculateDiscount(){process.exit(0)}',
    'export function calculateDiscount(){return Infinity}',
    'export function calculateDiscount(){return calculateDiscount()}',
    'export function calculateDiscount(){const a=[];while(true)a.push(new Array(99999).fill(1))}',
  ]) assert.notEqual((await verifier.verify(source, signal)).status, 'passed');
  const interrupted = await verifier.verify('while(true){}; export function calculateDiscount(){return 0}', AbortSignal.timeout(2000));
  assert.ok(['limit', 'cancelled'].includes(interrupted.failure ?? ''));
  assert.equal((await verifier.verify(reference, signal)).status, 'passed');
});
