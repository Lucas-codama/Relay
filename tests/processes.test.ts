import test from 'node:test';
import assert from 'node:assert/strict';
import { ownProcess, minimalEnv } from '../src/processes.js';
import { spawn } from 'node:child_process';
test('filho próprio encerrado e segredos não herdados', async () => {
  assert.equal(minimalEnv().ACCESS_TOKEN, undefined);
  assert.equal(minimalEnv().OPENAI_API_KEY, undefined);
  const owner = ownProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  assert.equal((await owner.stop()).stopped, true);
  assert.equal(owner.stopped, true);
  assert.equal((await owner.stop()).stopped, true);
});
test('raiz que morre deixando neto não é confirmação de árvore encerrada', async () => {
  const source = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(child.pid);child.unref();`;
  const owner = ownProcess(process.execPath, ['-e', source], { treeRequired: true });
  let data = ''; owner.child.stdout.on('data', b => { data += String(b); });
  await owner.exited;
  const pid = Number(data.trim()); assert.ok(Number.isSafeInteger(pid) && pid > 0);
  try { await assert.rejects(owner.stop(), /descendentes/); }
  finally {
    if (process.platform === 'win32') await new Promise<void>(resolve => {
      const cleanup = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      cleanup.once('close', () => resolve()); cleanup.once('error', () => { process.kill(pid); resolve(); });
    }); else process.kill(pid, 'SIGKILL');
  }
});
