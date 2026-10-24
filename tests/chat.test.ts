import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { runChat, type ChatOptions } from '../src/chat.js';
import type { ProjectReport } from '../src/project-types.js';

const report: ProjectReport = {
  version: 1, id: 'sample', status: 'answer', message: 'Resposta pronta', failure: null,
  attempts: [], usage: { input: null, output: null, cachedInput: null, reasoningOutput: null, total: null },
  contextBytes: 0, fullContextBytes: 0, cacheHit: false, check: null, durationMs: 0, backupId: null,
};
function createHarness(overrides: Partial<ChatOptions> = {}) {
  const input = new PassThrough(), output = new PassThrough();
  let text = '';
  output.on('data', chunk => { text += String(chunk); });
  const calls: string[] = [];
  const options: ChatOptions = {
    input, output, project: 'C:/projeto', signal: new AbortController().signal,
    async run(prompt, _signal, onEvent) { calls.push(prompt); onEvent({ type: 'route', message: 'leve' }); return report; },
    ...overrides,
  };
  const done = runChat(options);
  return { input, output, calls, text: () => text, done };
}

test('comandos locais não chamam IA e EOF encerra a conversa', async () => {
  const h = createHarness({ status: () => 'Estado de teste', undo: async () => 'Backup restaurado' });
  h.input.end('/help\n/status\n/undo\n/clear\n/inexistente\n');
  await h.done;
  assert.deepEqual(h.calls, []);
  assert.match(h.text(), /Estado de teste/);
  assert.match(h.text(), /Backup restaurado/);
  assert.match(h.text(), /Comando desconhecido/);
  assert.ok(!h.text().includes('\x1b'));
});

test('tarefas sequenciais recebem somente o pedido atual e status resumido é local', async () => {
  const h = createHarness();
  h.input.end('crie arquivo\n/status\nmelhore arquivo\n');
  await h.done;
  assert.deepEqual(h.calls, ['crie arquivo', 'melhore arquivo']);
  assert.match(h.text(), /Tarefas concluídas nesta conversa: 0/);
  assert.match(h.text(), /Na fila: 1/);
  assert.match(h.text(), /Resposta pronta/);
});

test('erro de uma tarefa é exibido sem derrubar o próximo pedido', async () => {
  const prompts: string[] = [];
  const h = createHarness({ async run(prompt) {
    prompts.push(prompt);
    if (prompts.length === 1) throw new Error('\x1b[2Jfalha sintética');
    return report;
  } });
  h.input.end('primeiro\nsegundo\n'); await h.done;
  assert.deepEqual(prompts, ['primeiro', 'segundo']);
  assert.match(h.text(), /problema no ambiente/);
  assert.match(h.text(), /Resposta pronta/);
  assert.ok(!h.text().includes('\x1b'));
});

test('sinal externo cancela trabalho ativo e impede pedidos seguintes', async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const h = createHarness({ signal: controller.signal, async run(_prompt, signal) {
    started();
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
    assert.equal(signal.aborted, true);
    return report;
  } });
  h.input.write('demorado\n');
  await ready; controller.abort(); await h.done;
  assert.match(h.text(), /Cancelado/);
  assert.ok(!h.text().includes('Resposta pronta'));
  assert.equal(controller.signal.onabort, null);
});

test('sinal já cancelado não executa trabalho nem deixa leitor ativo', async () => {
  const controller = new AbortController(); controller.abort();
  const h = createHarness({ signal: controller.signal }); await h.done;
  assert.deepEqual(h.calls, []);
  assert.equal(h.input.listenerCount('data'), 0);
});

test('Ctrl+C no terminal cancela somente a tarefa e mantém a conversa', async () => {
  const input = new PassThrough() as PassThrough & { isTTY: boolean };
  const output = new PassThrough() as PassThrough & { isTTY: boolean; columns: number };
  input.isTTY = true; output.isTTY = true; output.columns = 60;
  let text = '', calls = 0;
  output.on('data', chunk => { text += String(chunk); });
  let started!: () => void, cancelled!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const stopped = new Promise<void>(resolve => { cancelled = resolve; });
  const done = runChat({ input, output, project: 'teste', signal: new AbortController().signal,
    async run(_prompt, signal) {
      calls++;
      if (calls === 1) {
        started();
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
        cancelled();
      }
      return report;
    },
  });
  input.write('tarefa\n'); await ready;
  input.write('\x03'); await stopped;
  input.end('outra tarefa\n'); await done;
  assert.equal(calls, 2);
  assert.match(text, /Cancelando/);
  assert.match(text, /Resposta pronta/);
});


function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => {resolve=r;}); return {promise,resolve}; }
const paid = (tokens: number, id='task'): ProjectReport => ({...report,id,usage:{input:tokens,output:0,cachedInput:0,reasoningOutput:0,total:tokens}});

test('/status, /details e /usage respondem durante tarefa sem outra síntese', {timeout:3000}, async()=>{
  const started=deferred(), release=deferred();let calls=0;
  const h=createHarness({async run(_p,_s,event){calls++;event({type:'thinking',message:'mensagem interna de teste'});event({type:'usage',message:'',usage:paid(12).usage});started.resolve();await release.promise;return paid(12);}});
  try {
    h.input.write('trabalhe\n');await started.promise;
    h.input.write('/status\n/details\n/usage\n/help\n');
    assert.match(h.text(),/Gerando/);assert.match(h.text(),/mensagem interna de teste/);assert.match(h.text(),/Tarefa: 12 tokens/);assert.equal(calls,1);assert.ok(!h.text().includes('Resposta pronta'));
  } finally {release.resolve();h.input.end();await h.done;}
});

test('/cancel mantém fila e aguarda encerramento antes da próxima tarefa', {timeout:3000},async()=>{
  const started=deferred(),cleanup=deferred();let calls=0,active=0;
  const h=createHarness({async run(_p,signal){calls++;active++;assert.equal(active,1);try{if(calls===1){started.resolve();await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));await cleanup.promise;return {...paid(7),status:'failed',failure:'cancelled'};}return paid(3);}finally{active--;}}});
  h.input.write('primeira\nsegunda\n');await started.promise;h.input.write('/cancel\n/status\n');assert.equal(calls,1);assert.match(h.text(),/Cancelando/);
  cleanup.resolve();h.input.end();await h.done;assert.equal(calls,2);assert.equal(active,0);
});

test('/exit cancela, elimina fila e só encerra após limpeza', {timeout:3000},async()=>{
  const started=deferred(),cleanup=deferred();let calls=0,ended=false;
  const h=createHarness({async run(_p,signal){calls++;started.resolve();await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));await cleanup.promise;return {...paid(4),status:'failed',failure:'cancelled'};}});
  void h.done.then(()=>{ended=true;});h.input.write('primeira\nsegunda\n');await started.promise;h.input.write('/exit\nterceira\n');
  await new Promise(r=>setImmediate(r));assert.equal(ended,false);assert.equal(calls,1);cleanup.resolve();await h.done;assert.equal(ended,true);assert.equal(calls,1);assert.equal(h.input.listenerCount('data'),0);
});

test('consumo agrega tarefas e reuso sem somar novamente snapshots', {timeout:3000},async()=>{
  let calls=0;const h=createHarness({async run(_p,_s,event){calls++;for(let i=0;i<2;i++)event({type:'usage',message:'',usage:paid(5).usage});return calls===1?paid(10,'a'):calls===2?{...paid(0,'b'),cacheHit:true}:paid(6,'c');}});
  h.input.write('primeira\nsegunda\nterceira\n');await new Promise(r=>setImmediate(r));h.input.write('/usage\n/status\n');
  assert.match(h.text(),/Conversa: 16 tokens/);assert.match(h.text(),/Reaproveitadas: 1/);assert.match(h.text(),/Consumo por tarefa \(3 de 3\)/);assert.equal(calls,3);h.input.end();await h.done;
});

test('erros ficam no details e preservam tokens já observados', {timeout:3000},async()=>{
  const h=createHarness({async run(_p,_s,event){event({type:'usage',message:'',usage:paid(7).usage});throw Error('diagnóstico sintético exclusivo');}});
  h.input.write('tarefa\n');await new Promise(r=>setImmediate(r));assert.ok(!h.text().includes('diagnóstico sintético exclusivo'));
  h.input.write('/details\n/usage\n');assert.match(h.text(),/diagnóstico sintético exclusivo/);assert.match(h.text(),/Conversa: 7 tokens/);h.input.end();await h.done;
});

test('fila é limitada e /undo não concorre com tarefa ativa', {timeout:3000},async()=>{
  const release=deferred();let calls=0,undos=0;const h=createHarness({async run(){calls++;if(calls===1)await release.promise;return paid(1);},async undo(){undos++;return 'desfeito';}});
  h.input.write('primeira\n'+Array.from({length:10},(_,i)=>'pendente'+i+'\n').join('')+'/undo\n');assert.match(h.text(),/Fila cheia/);assert.equal(undos,0);
  release.resolve();h.input.end();await h.done;assert.equal(calls,9);
});

test('edição de comando no TTY pausa animação e sobrevive ao fim da tarefa', {timeout:3000},async()=>{
  const old=process.env.NO_COLOR;delete process.env.NO_COLOR;
  const input=new PassThrough() as PassThrough & {isTTY:boolean},output=new PassThrough() as PassThrough & {isTTY:boolean;columns:number};input.isTTY=true;output.isTTY=true;output.columns=40;
  let text='',calls=0;output.on('data',b=>{text+=String(b);});const started=deferred(),release=deferred();
  const done=runChat({input,output,project:'test',signal:new AbortController().signal,async run(){calls++;started.resolve();await release.promise;return paid(2);}});
  try{input.write('tarefa\n');await started.promise;input.write('/status');const before=text;await new Promise(r=>setTimeout(r,280));assert.equal(text,before);release.resolve();await new Promise(r=>setImmediate(r));input.write('\n');assert.match(text,/Tarefas concluídas nesta conversa: 1/);assert.equal(calls,1);input.end();await done;assert.equal(input.listenerCount('keypress'),0);}finally{release.resolve();input.end();await done;if(old===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=old;}
});
