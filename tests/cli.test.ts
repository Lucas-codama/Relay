import test from 'node:test';
import assert from 'node:assert/strict';
import { main, parseCli, exitCode } from '../src/cli.js';
import { RelayError } from '../src/errors.js';
test('CLI valida comando, pedido e flags antes de qualquer efeito', async () => {
  for (const args of [['unknown'], ['demo', ''], ['demo'], ['demo', 'a', 'b'], ['doctor', '--compare'], ['login', '--account', '../x']]) assert.throws(() => parseCli(args));
  assert.equal(parseCli(['demo', 'Corrija.', '--compare']).compare, true);
  assert.equal(parseCli(['demo', 'Corrija.', '--max-turns', '1']).maxTurns, 1);
  assert.throws(() => parseCli(['demo', 'Corrija.', '--max-turns', '3']));
  assert.equal(parseCli(['run', 'Crie.', '--details']).details, true);
  assert.throws(() => parseCli(['doctor', '--details']));
  let output = ''; assert.equal(await main(['--help'], { write: s => { output += s; } }), 0);
  assert.ok(output.includes('até dois turnos'));
});
test('CLI reporta doctor/cancelamento e códigos de saída', async () => {
  let output = '';
  assert.equal(await main(['doctor'], { root: '.local/synthetic', write: s => { output += s; }, doctor: async () => 'diagnóstico sintético\n' }), 0);
  assert.ok(output.includes('sintético'));
  assert.equal(await main(['doctor'], { root: '.local/synthetic', write() {}, doctor: async () => { throw new RelayError('cancelled', 'Interrompido'); } }), 130);
  assert.equal(exitCode('access'), 4); assert.equal(exitCode('environment'), 3); assert.equal(exitCode('limit'), 5);
});
