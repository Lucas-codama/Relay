import test from 'node:test';
import assert from 'node:assert/strict';
import type { RpcClient } from '../src/contracts.js';
import { CodexSynthesis, parseCandidate, responseInstructions } from '../src/codex.js';
const profile = { model: 'catalog-model', effort: 'low' };
test('candidato estrito e pedido de informação', () => {
  assert.deepEqual(parseCandidate({ kind: 'candidate', source: 'export const a=1', reason: '' }), { kind: 'candidate', source: 'export const a=1' });
  assert.equal(parseCandidate({ kind: 'needsInput', source: '', reason: 'Informe o escopo.' }).kind, 'needsInput');
  for (const value of [null, { kind: 'candidate', source: '', reason: '' }, { kind: 'candidate', source: 'x', reason: '', extra: true }]) assert.throws(() => parseCandidate(value));
  assert.throws(() => parseCandidate({ kind: 'candidate', source: 'x', reason: 'explanation' }), /inconsistente/);
  assert.ok(responseInstructions.includes('reason=""'));
});
for (const status of ['completed', 'failed', 'interrupted', 'tool', 'empty', 'invalid']) test(`síntese ${status} exige término e recusa ferramentas`, async () => {
  let listener = (_method: string, _params: unknown) => {}; let closed = false;
  const rpc: RpcClient = {
    async request(method) {
      if (method === 'thread/start') return { thread: { id: 'thread1' } };
      // Notifications deliberately precede the turn/start response.
      if (status === 'tool') listener('relay/forbiddenRequest', { method: 'tool/call' });
      else {
        listener('optional/new', null);
        listener('item/started', { threadId: 'thread1', turnId: 'turn1', item: { type: 'agentMessage', text: '' } });
        listener('item/completed', { threadId: 'thread1', turnId: 'turn1', item: { type: 'agentMessage', text: status === 'empty' ? '' : status === 'invalid' ? '{' : '{"kind":"candidate","source":"x","reason":""}' } });
        listener('turn/completed', { threadId: 'thread1', turn: { id: 'turn1', status: ['completed', 'failed', 'interrupted'].includes(status) ? status : 'completed' } });
      }
      return { turn: { id: 'turn1' } };
    },
    notify() {}, onNotification(fn) { listener = fn; return () => {}; }, async close() { closed = true; },
  };
  const port = new CodexSynthesis(async () => rpc, process.cwd());
  if (['tool', 'empty', 'invalid'].includes(status)) await assert.rejects(port.synthesize(profile, 'prompt', AbortSignal.timeout(2000)));
  else assert.equal((await port.synthesize(profile, 'prompt', AbortSignal.timeout(2000))).terminal, status);
  assert.equal(closed, true);
});


test('telemetria correlaciona snapshots e cota sem deixar leitura antiga substituir notificação',async()=>{
  let listener=(_m:string,_p:unknown)=>{};let readQuota!:(v:unknown)=>void;const events: import('../src/contracts.js').SynthesisProgress[]=[];
  const rpc:RpcClient={async request(method){
    if(method==='thread/start')return {thread:{id:'thread'}};
    if(method==='account/rateLimits/read')return new Promise(resolve=>{readQuota=resolve;});
    listener('account/rateLimits/updated',{rateLimits:{primary:{usedPercent:40}}});
    const snapshot={inputTokens:20,outputTokens:10,totalTokens:30,cachedInputTokens:0,reasoningOutputTokens:0};
    listener('thread/tokenUsage/updated',{threadId:'wrong',turnId:'turn',tokenUsage:{total:snapshot}});
    for(let i=0;i<2;i++)listener('thread/tokenUsage/updated',{threadId:'thread',turnId:'turn',tokenUsage:{total:snapshot}});
    readQuota({rateLimits:{primary:{usedPercent:25}}});
    listener('item/completed',{threadId:'thread',turnId:'turn',item:{type:'agentMessage',text:'{}'}});
    listener('turn/completed',{threadId:'thread',turn:{id:'turn',status:'completed'}});return {turn:{id:'turn'}};
  },notify(){},onNotification(fn){listener=fn;return()=>{};},async close(){}};
  const result=await new CodexSynthesis(async()=>rpc,process.cwd()).synthesize(profile,'x',AbortSignal.timeout(2000),e=>events.push(e));
  assert.equal(result.usage.total,30);assert.deepEqual(events.filter(e=>e.type==='usage').map(e=>e.usage.total),[30,30]);
  assert.deepEqual(events.filter(e=>e.type==='quota').map(e=>e.quota.windows[0]?.usedPercent),[40]);
});

test('cota indisponível e observador com erro não interrompem síntese',async()=>{
  let listener=(_m:string,_p:unknown)=>{};
  const rpc:RpcClient={async request(method){if(method==='thread/start')return {thread:{id:'t'}};
    if(method==='account/rateLimits/read')throw Error('sem cota');
    await new Promise(resolve=>setImmediate(resolve));
    listener('thread/tokenUsage/updated',{threadId:'t',turnId:'u',tokenUsage:{total:{totalTokens:3}}});
    listener('item/completed',{threadId:'t',turnId:'u',item:{type:'agentMessage',text:'{}'}});
    listener('turn/completed',{threadId:'t',turn:{id:'u',status:'completed'}});return {turn:{id:'u'}};
  },notify(){},onNotification(fn){listener=fn;return()=>{};},async close(){}};
  const result=await new CodexSynthesis(async()=>rpc,process.cwd()).synthesize(profile,'x',AbortSignal.timeout(2000),()=>{throw Error('observador');});
  assert.equal(result.terminal,'completed');assert.equal(result.usage.total,3);
});


test('erro estruturado terminal e notificação distinguem cota de autenticação sem texto bruto',async()=>{
  for(const [info,expected]of [['usageLimitExceeded','quota'],['unauthorized','authentication']] as const){
    let listener=(_m:string,_p:unknown)=>{};const rpc:RpcClient={async request(method){if(method==='thread/start')return{thread:{id:'t'}};listener('error',{threadId:'t',turnId:'u',willRetry:false,error:{codexErrorInfo:info,message:'SECRET_PROVIDER_TEXT'}});listener('turn/completed',{threadId:'t',turn:{id:'u',status:'failed',error:null}});return{turn:{id:'u'}};},notify(){},onNotification(fn){listener=fn;return()=>{};},async close(){}};
    const result=await new CodexSynthesis(async()=>rpc,process.cwd()).synthesize(profile,'x',AbortSignal.timeout(2000));assert.equal(result.providerFailure?.reason,expected);assert.equal(result.failure,'access');assert.ok(!JSON.stringify(result).includes('SECRET_PROVIDER_TEXT'));
  }
});
