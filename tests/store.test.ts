import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile, symlink, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createSessionStore, registrationId } from '../src/store.js';
import type { CredentialRecord } from '../src/contracts.js';

const base = resolve('.local');
async function temporary() {
  await mkdir(base, { recursive: true });
  const owned = await mkdtemp(join(base, 'test-owned-store-'));
  const root = join(owned, 'state');
  return { root, store: createSessionStore(root), cleanup: async () => {
    assert.ok(owned.startsWith(join(base, 'test-owned-store-')));
    await rm(owned, { recursive: true, force: true });
  } };
}
function credential(subject = 'synthetic-subject'): CredentialRecord {
  const issuer = 'https://auth.openai.com'; const clientId = 'oaiapp_synthetic';
  return { registrationId: registrationId(issuer, subject, clientId), issuer, subject, clientId,
    hostId: 'urn:uuid:11111111-1111-1111-1111-111111111111', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
    idToken: 'synthetic-id', expiresAt: 123456, scopes: ['chatgpt.tokens.use.direct'] };
}
async function powershell(script: string, input: string): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let output = ''; let diagnostic = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-2048); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? accept(output.trim()) : reject(new Error(`Synthetic ACL operation failed: ${diagnostic.replaceAll(base, '[test-owned]')}`)));
    child.stdin.end(input);
  });
}
test('duas identidades com mesmo clientId têm IDs distintos, leitura e rótulos locais', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  try {
    const one = credential(); const two = credential('second-subject');
    await h.store.write(one); await h.store.write(two);
    await h.store.setLabel(one.registrationId, 'Conta de teste');
    assert.deepEqual(await h.store.read(one.registrationId), one);
    assert.deepEqual(await h.store.read(two.registrationId), two);
    const list = await h.store.listRegistrations();
    assert.equal(list.length, 2);
    assert.equal(list.find(item => item.id === one.registrationId)!.label, 'Conta de teste');
    assert.ok(list.every(item => Object.keys(item).sort().join() === 'id,label'));
    await assert.rejects(h.store.write({ ...one, subject: 'second-subject' }), /identidade|Vínculo/);
    await assert.rejects(h.store.read('../host'), /inválido/);
  } finally { await h.cleanup(); }
});
test('host ID é estável após reiniciar store; locks são exclusivos entre instâncias', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  try {
    const first = await h.store.getHostId();
    const second = createSessionStore(h.root);
    assert.equal(await second.getHostId(), first);
    const order: string[] = [];
    await Promise.all([
      h.store.withLock('a'.repeat(64), async () => { order.push('start'); await new Promise(resolve => setTimeout(resolve, 150)); order.push('end'); }),
      second.withLock('a'.repeat(64), async () => { order.push('other'); }),
    ]);
    assert.ok(order.join() === 'start,end,other' || order.join() === 'other,start,end');
  } finally { await h.cleanup(); }
});
test('arquivo recebe ACL sem herança user/SYSTEM antes de conter segredos', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  try {
    const value = credential();
    await h.store.write(value);
    const file = join(h.root, `${value.registrationId}.json`);
    const checked = JSON.parse(await powershell("$p=[Console]::In.ReadToEnd(); $a=Get-Acl -LiteralPath $p; @{protected=$a.AreAccessRulesProtected; rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {$_.IdentityReference.Value})} | ConvertTo-Json -Compress", file));
    assert.equal(checked.protected, true);
    assert.equal(checked.rules.length, 2);
    assert.ok(checked.rules.includes('S-1-5-18'));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).refreshToken, 'synthetic-refresh');
    // An interrupted callback inside a lock preserves the previous complete token unit.
    await assert.rejects(h.store.withLock(value.registrationId, async () => { throw new Error('synthetic interruption'); }));
    assert.deepEqual(await h.store.read(value.registrationId), value);
    await h.store.write({ ...value, accessToken: 'replacement', refreshToken: 'rotation', expiresAt: 456789 });
    assert.equal((await h.store.read(value.registrationId))!.refreshToken, 'rotation');
  } finally { await h.cleanup(); }
});
test('ACL insegura é recusada sem corrigir silenciosamente o arquivo', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  try {
    const value = credential(); await h.store.write(value);
    const file = join(h.root, `${value.registrationId}.json`);
    // Manufacture bad input using only this synthetic file, without SeSecurityPrivilege.
    assert.ok(file.startsWith(h.root));
    await unlink(file); await writeFile(file, JSON.stringify(value), { flag: 'wx' });
    const protectedAcl = await powershell("$p=[Console]::In.ReadToEnd(); [Console]::Out.Write((Get-Acl -LiteralPath $p).AreAccessRulesProtected)", file);
    assert.equal(protectedAcl, 'False');
    await assert.rejects(h.store.read(value.registrationId), /proteção/);
    await assert.rejects(h.store.write({ ...value, accessToken: 'must-not-write' }), /proteção/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).accessToken, 'synthetic-access');
  } finally { await h.cleanup(); }
});
test('morte abrupta do dono libera o lock do sistema e permite retomar sem remover arquivo', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  const moduleUrl = new URL('../src/store.js', import.meta.url).href;
  const source = `import {createSessionStore} from ${JSON.stringify(moduleUrl)}; const s=createSessionStore(process.argv[1]); await s.withLock('b'.repeat(64),async()=>{process.stdout.write('locked\\n');await new Promise(()=>{});});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, h.root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise<void>(accept => child.once('close', () => accept()));
  let ready = '';
  try {
    await new Promise<void>((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Synthetic lock child timed out')), 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', () => { clearTimeout(timer); if (!ready.includes('locked\n')) reject(new Error('Synthetic lock child ended before acquisition')); });
      child.stdout.on('data', chunk => { ready += String(chunk); if (ready.includes('locked\n')) { clearTimeout(timer); accept(); } });
      child.stderr.on('data', () => {});
    });
    // Force termination of this owned synthetic Node process; stdin EOF releases its helper's handle.
    child.kill('SIGKILL');
    await closed;
    let acquired = false;
    await createSessionStore(h.root).withLock('b'.repeat(64), async () => { acquired = true; });
    assert.equal(acquired, true);
    assert.equal((await readFile(join(h.root, `${'b'.repeat(64)}.lock`))).length, 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    await h.cleanup();
  }
});
test('redirecionamento por junction e vínculo de registro adulterado são recusados', { skip: process.platform !== 'win32' }, async () => {
  const h = await temporary();
  try {
    const value = credential(); await h.store.write(value);
    const file = join(h.root, `${value.registrationId}.json`);
    await writeFile(file, JSON.stringify({ ...value, subject: 'tampered' }));
    await assert.rejects(h.store.read(value.registrationId), /Vínculo/);
    const redirect = join(h.root, 'redirect');
    await symlink(h.root, redirect, 'junction');
    await assert.rejects(createSessionStore(redirect).getHostId(), /redirecionado|proteção/);
    await rm(redirect);
  } finally { await h.cleanup(); }
});
