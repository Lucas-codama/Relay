import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createLiveStatus } from '../src/live-status.js';
import { parseQuota } from '../src/quota.js';
import { emptyUsage } from '../src/usage.js';
import { cleanTerminalText, type TerminalOutput } from '../src/terminal-ui.js';
import type { ProjectReport } from '../src/project-types.js';

test('cota prefere múltiplos buckets, preserva zero e ausência não vira saldo', () => {
  assert.deepEqual(parseQuota(null, 1), { state: 'unavailable', windows: [], updatedAt: 1 });
  const quota = parseQuota({ rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: {
    codex: { primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1800000000 }, secondary: null },
    other: { primary: { usedPercent: 120 }, secondary: { usedPercent: null } },
  } }, 2);
  assert.equal(quota.windows.length, 2); assert.equal(quota.windows[0]?.usedPercent, 0);
  assert.equal(quota.windows[1]?.windowDurationMins, null);
  assert.equal(parseQuota({ rateLimits: { primary: { usedPercent: -1 } } }).state, 'unavailable');
});

function capture(tty: boolean, columns = 120) {
  const output = new PassThrough() as TerminalOutput; output.isTTY = tty; output.columns = columns;
  let text = ''; output.on('data', b => { text += String(b); });
  return { output, text: () => text };
}
function color(enabled: boolean) {
  const original = process.env.NO_COLOR;
  if (enabled) delete process.env.NO_COLOR; else process.env.NO_COLOR = '';
  return () => { if (original === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = original; };
}
const sleep = () => new Promise(resolve => setTimeout(resolve, 25));
const usage = (total: number) => ({ ...emptyUsage(), total, input: total - 10, output: 10 });

test('painel TTY mostra modelo, esforço, tentativa e relógio; stop congela tempo e timer', async () => {
  const restore = color(true), c = capture(true); let time = 0;
  const live = createLiveStatus(c.output, { now: () => time, refreshMs: 10 });
  try {
    live.start(); live.event({ type: 'route', message: 'razão técnica', attempt: 1, profile: { model: 'small', effort: 'low' } });
    live.event({ type: 'thinking', message: 'contexto técnico' });
    live.event({ type: 'usage', message: '', usage: usage(30) });
    time = 2100; await sleep();
    assert.match(live.status(), /Gerando · 00:02 · small\/low · tentativa 1 · tokens: 30/);
    assert.match(c.text(), /small\/low/); assert.ok(c.text().includes('\x1b[2K'));
    assert.ok(!c.text().includes('razão técnica'));
    live.stop(); const after = c.text(), snapshot = live.snapshot();
    time = 9000; await sleep(); live.stop();
    assert.equal(c.text(), after); assert.equal(live.snapshot(), snapshot);
  } finally { live.stop(); restore(); }
});

test('pausa coleta eventos sem desenhar ou imprimir; retomar preserva o relógio e dados', async () => {
  const restore = color(true), c = capture(true); let time = 0;
  const live = createLiveStatus(c.output, { now: () => time, refreshMs: 10 });
  try {
    live.start(); live.pause(); const after = c.text();
    live.event({ type: 'check', message: 'diagnóstico preservado' });
    live.event({ type: 'usage', message: '', usage: usage(51) });
    live.event({ type: 'quota', message: '', quota: parseQuota(null, 1234) });
    time = 2200; await sleep();
    assert.equal(c.text(), after); assert.match(live.status(), /Testando · 00:02.*tokens: 51/);
    assert.match(live.details(), /diagnóstico preservado/); assert.match(live.details(), /Cota: indisponível/);
    live.resume(); assert.notEqual(c.text(), after); assert.match(c.text(), /tokens: 51/);
    time = 3100; await sleep(); assert.match(live.status(), /00:03/);
    live.stop(); const stopped = c.text(); live.resume(); await sleep(); assert.equal(c.text(), stopped);
  } finally { live.stop(); restore(); }
});

test('pipe e NO_COLOR mostram somente etapas significativas e uso deduplicado por segundo', () => {
  const restore = color(false);
  try {
    for (const tty of [true, false]) {
      let time = 0; const c = capture(tty), live = createLiveStatus(c.output, { now: () => time }); live.start();
      assert.equal(c.text(), ''); assert.match(live.status(), /tokens: -/);
      live.event({ type: 'route', message: 'roteamento técnico', attempt: 1, profile: { model: 'small', effort: 'low' } });
      live.event({ type: 'thinking', message: 'Gerando código' });
      live.event({ type: 'thinking', message: 'aviso repetido' });
      assert.equal(c.text().match(/Gerando/g)?.length, 1);
      for (let i = 0; i < 2; i++) live.event({ type: 'usage', message: '', usage: usage(45) });
      assert.equal(c.text().match(/tokens: 45/g)?.length, 1);
      time = 500; live.event({ type: 'usage', message: '', usage: usage(50) });
      assert.ok(!c.text().includes('tokens: 50'));
      time = 1000; live.event({ type: 'usage', message: '', usage: usage(60) });
      assert.equal(c.text().match(/tokens: 60/g)?.length, 1);
      time = 3000; live.event({ type: 'usage', message: '', usage: usage(60) });
      assert.equal(c.text().match(/tokens: 60/g)?.length, 1);
      live.event({ type: 'quota', message: 'quota indisponível', quota: parseQuota(null) });
      live.event({ type: 'info', message: 'sem medição da assinatura' });
      live.event({ type: 'check', message: 'Executando testes em cópia isolada e sem credenciais.' });
      live.event({ type: 'check', message: 'aviso repetido' });
      assert.equal(c.text().match(/Testando/g)?.length, 1);
      assert.ok(!c.text().includes('\x1b'));
      assert.ok(!/indisponível|técnico|sem medição|credenciais/.test(c.text()));
      assert.match(live.details(), /Cota: indisponível/); assert.match(live.details(), /sem medição da assinatura/);
      const beforeFinish = c.text(); live.finish(); assert.equal(c.text(), beforeFinish);
    }
  } finally { restore(); }
});

test('snapshots de tokens substituem valores anteriores e finish atualiza sem repetir relatório', () => {
  const c = capture(false); let time = 0;
  const live = createLiveStatus(c.output, { now: () => time }); live.start();
  live.event({ type: 'usage', message: '', usage: usage(10) });
  live.event({ type: 'usage', message: '', usage: usage(30) });
  assert.match(live.status(), /tokens: 30/); assert.match(live.snapshot(), /Entrada: 20 · saída: 10 · cache: -/);
  const before = c.text(); time = 4000;
  live.finish({ status: 'passed', usage: usage(35) } as ProjectReport);
  assert.equal(c.text(), before); assert.match(live.status(), /Concluído · 00:04.*tokens: 35/);
  time = 9000; assert.match(live.status(), /00:04/);
  live.start(); assert.match(live.status(), /00:00.*tokens: -/); assert.ok(!live.details().includes('tokens: 35')); live.stop();
});

test('cota disponível é curta e deduplicada; detalhes guardam janelas e renovação', () => {
  const c = capture(false), live = createLiveStatus(c.output); live.start();
  const quota = parseQuota({ rateLimits: {
    primary: { usedPercent: 50, windowDurationMins: 300, resetsAt: 1800000000 },
    secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1800600000 },
  } }, 1000);
  live.event({ type: 'quota', message: '', quota }); live.event({ type: 'quota', message: '', quota: { ...quota, updatedAt: 2000 } });
  assert.equal(c.text().match(/50% restante/g)?.length, 1); assert.match(c.text(), /100% restante/);
  assert.ok(!/renova|assinatura/.test(c.text()));
  assert.match(live.details(), /primary: 50% restante \(5h; renova/);
  assert.match(live.details(), /secondary: 100% restante \(1 sem; renova/);
  quota.windows[0]!.usedPercent = 99;
  assert.match(live.snapshot(), /50% restante/); live.stop();
});

test('largura estreita, controles do provedor e detalhes limitados não quebram o terminal', () => {
  const restore = color(true), c = capture(true, 24), live = createLiveStatus(c.output);
  try {
    live.start();
    live.event({ type: 'route', message: '\x1b[2JBearer secret\n```js\nsource\n```', attempt: 1, profile: { model: '\x1b]0;title\x07small\nmodel', effort: 'low' } });
    live.event({ type: 'edit', message: 'src/a.ts, src/b.ts\nDUMP' });
    assert.ok(!c.text().includes('\x1b[2J')); assert.ok(!c.text().includes('title')); assert.ok(!c.text().includes('DUMP'));
    for (const painted of c.text().split('\r\x1b[2K')) assert.ok(Array.from(cleanTerminalText(painted)).length <= 23);
    assert.match(live.details(), /Bearer \[oculto\].*\[código omitido\]/); assert.ok(!live.details().includes('secret'));
    live.pause();
    for (let i = 0; i < 200; i++) live.event({ type: 'error', message: `${i}: ${'診断'.repeat(1500)} api_key=private` });
    assert.ok(Buffer.byteLength(live.details(), 'utf8') <= 32 * 1024);
    assert.ok(live.details().split('\n').filter(line => line.startsWith('error:')).length <= 50);
    assert.ok(!live.details().includes('private'));
    assert.match(live.details(), /199:/);
  } finally { live.stop(); restore(); }
});
