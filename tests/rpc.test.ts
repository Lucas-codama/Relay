import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ownProcess } from '../src/processes.js';
import { JsonlRpc } from '../src/rpc.js';
const helper = fileURLToPath(new URL('../../tests/helpers/fake-app-server.mjs', import.meta.url));
test('chunks, Unicode e múltiplas linhas correlacionam pedidos', async () => {
  const owner = ownProcess(process.execPath, [helper, 'split']);
  const rpc = new JsonlRpc(owner);
  try {
    const results = await Promise.all(['ação', 'outro'].map(echo => rpc.request('echo', echo, AbortSignal.timeout(2000))));
    assert.deepEqual(results, [{ echo: 'ação' }, { echo: 'outro' }]);
  } finally { await rpc.close(); }
  assert.equal(owner.stopped, true);
});
for (const mode of ['invalid', 'early', 'hang']) test(`protocolo ${mode} rejeita sem pendurar`, async () => {
  const rpc = new JsonlRpc(ownProcess(process.execPath, [helper, mode]));
  try { await assert.rejects(rpc.request('x', {}, AbortSignal.timeout(mode === 'hang' ? 100 : 2000))); }
  finally { await rpc.close(); }
});
test('ID duplicado invalida conexão', async () => {
  const rpc = new JsonlRpc(ownProcess(process.execPath, [helper, 'duplicate']));
  try {
    await rpc.request('x', {}, AbortSignal.timeout(2000)).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 50));
    await assert.rejects(rpc.request('x', {}, AbortSignal.timeout(1000)));
  } finally { await rpc.close(); }
});
