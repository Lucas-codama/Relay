import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'; import { resolve, join } from 'node:path';
import { createProjectEngine, repairTargets } from '../src/project-engine.js'; import { emptyUsage } from '../src/usage.js';
import type { ProjectReply } from '../src/project-types.js';
import { RelayError } from '../src/errors.js';
const config = { version: 1 as const, profiles: { economico: { model: 'small', effort: 'low' }, robusto: { model: 'large', effort: 'high' } } };
const catalog = [{ model: 'small', efforts: ['low', 'medium'] }, { model: 'large', efforts: ['high'] }];
async function fixture() { const base = resolve('.local'); await mkdir(base, { recursive: true }); const root = await mkdtemp(join(base, 'test-owned-engine-')); return { root, project: join(root, 'project'), state: join(root, 'state'), async clean() { assert.ok(root.startsWith(join(base, 'test-owned-engine-'))); await rm(root, { recursive: true, force: true }); } }; }
const pass = { status: 'passed' as const, failure: null, diagnostic: '1 test passed', failedFiles: [], tests: 1, trusted: true };
test('repara apenas o módulo falho, preserva testes/outros arquivos e reutiliza cache sem IA', async () => {
  const f = await fixture(); let calls = 0; const requested: string[] = []; const observed: number[] = [];
  try {
    await mkdir(join(f.project, 'src'), { recursive: true }); await mkdir(join(f.project, 'tests'));
    await writeFile(join(f.project, 'src/good.js'), 'export const good=42;'); await writeFile(join(f.project, 'src/bad.js'), 'export function bad(){return 0;}');
    const evaluator = 'import {bad} from "../src/bad.js"; // external evaluator'; await writeFile(join(f.project, 'tests/bad.test.js'), evaluator);
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog,
      synthesis: { async synthesize(p, input, _signal, progress) { requested.push(p.effort); calls++; for(let i=0;i<2;i++) progress?.({type:'usage',usage:{...emptyUsage(),total:10}}); if (calls === 2) assert.ok(!JSON.parse(input).files.some((f: {path: string}) => f.path === 'src/good.js')); return { terminal: 'completed', reply: { kind: 'edit', message: 'corrigido', read: [], edits: [{ path: 'src/bad.js', before: 'return ' + (calls === 1 ? 0 : 1), after: 'return ' + (calls === 1 ? 1 : 2) }] } satisfies ProjectReply,
        usage: { ...emptyUsage(), total: 10 }, threadId: 't', turnId: String(calls), observedModel: null, failure: null }; }, async stop() { return { stopped: true }; } },
      checker: { async check(s) { return s.files.some(file => file.path === 'src/bad.js' && file.content.includes('return 2')) ? pass : { ...pass, status: 'failed', failure: 'implementation', failedFiles: ['tests/bad.test.js'], diagnostic: 'expected 2' }; } } });
    const report = await engine.run('Corrija src/bad.js', new AbortController().signal, event => { if(event.type==='usage') observed.push(event.usage!.total!); });
    assert.deepEqual(observed,[10,10,20,20]);
    assert.equal(report.status, 'passed'); assert.deepEqual(report.attempts[0]?.created, []); assert.deepEqual(report.attempts[0]?.modified, ['src/bad.js']); assert.equal(calls, 2); assert.deepEqual(requested, ['low', 'medium']); assert.equal(report.usage.total, 20);
    assert.equal(await readFile(join(f.project, 'src/good.js'), 'utf8'), 'export const good=42;'); assert.equal(await readFile(join(f.project, 'tests/bad.test.js'), 'utf8'), evaluator);
    const cached = await engine.run('Corrija src/bad.js', new AbortController().signal); assert.equal(cached.cacheHit, true); assert.equal(cached.usage.total, 0); assert.equal(calls, 2);
    await engine.run('Olá!', new AbortController().signal); await engine.undo();
    assert.ok((await readFile(join(f.project, 'src/bad.js'), 'utf8')).includes('return 1'));
  } finally { await f.clean(); }
});
test('falha de acesso não escala e não relata tokens desconhecidos como zero', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog, checker: { async check() { return pass; } },
      synthesis: { async synthesize() { calls++; throw new RelayError('access', 'sem acesso'); }, async stop() { return { stopped: true }; } } });
    const report = await engine.run('Crie um módulo', new AbortController().signal); assert.equal(calls, 1); assert.equal(report.failure, 'access'); assert.equal(report.usage.total, null);
  } finally { await f.clean(); }
});
test('saudação e conversa local não gastam inferência', async () => {
  const f = await fixture(); try {
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog, checker: { async check() { return pass; } }, synthesis: { async synthesize() { throw new Error('must not infer'); }, async stop() { return { stopped: true }; } } });
    const report = await engine.run('Olá!', new AbortController().signal); assert.equal(report.status, 'answer'); assert.equal(report.usage.total, 0);
  } finally { await f.clean(); }
});
test('cancelamento durante síntese impede a aplicação de arquivos', async () => {
  const f = await fixture(), controller = new AbortController();
  try {
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog, checker: { async check() { return pass; } },
      synthesis: { async synthesize() { controller.abort(); return { terminal: 'completed', reply: { kind: 'edit', message: 'x', edits: [{ path: 'a.js', before: '', after: 'x' }], read: [] }, usage: emptyUsage(), threadId: null, turnId: null, observedModel: null, failure: null }; }, async stop() { return { stopped: true }; } } });
    const report = await engine.run('Crie a.js', controller.signal); assert.equal(report.failure, 'cancelled');
    await assert.rejects(readFile(join(f.project, 'a.js')));
  } finally { await f.clean(); }
});
test('maiúsculas não contornam a proteção dos testes', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.project, 'tests'), { recursive: true }); await writeFile(join(f.project, 'tests/a.test.js'), 'protected');
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog, checker: { async check() { return pass; } },
      synthesis: { async synthesize() { return { terminal: 'completed', reply: { kind: 'edit', message: 'x', edits: [{ path: 'TESTS/a.test.js', before: 'protected', after: 'weakened' }], read: [] }, usage: emptyUsage(), threadId: null, turnId: null, observedModel: null, failure: null }; }, async stop() { return { stopped: true }; } } });
    const report = await engine.run('Corrija', new AbortController().signal); assert.equal(report.failure, 'integrity'); assert.equal(await readFile(join(f.project, 'tests/a.test.js'), 'utf8'), 'protected');
  } finally { await f.clean(); }
});


test('protocolo inválido e leitura ausente sobem capacidade sem modificar o projeto', async () => {
  const f = await fixture(); let calls = 0; const efforts: string[] = [];
  try {
    const engine = createProjectEngine({ project: f.project, stateRoot: f.state, config, catalog, checker: { async check() { return pass; } },
      synthesis: { async synthesize(profile) { efforts.push(profile.effort); calls++;
        const reply = calls === 1 ? {kind:'edit',message:'inválido',edits:[],read:[]} : calls === 2 ?
          {kind:'read',message:'preciso ler',edits:[],read:['missing.js']} :
          {kind:'edit',message:'criado',edits:[{path:'a.js',before:'',after:'export const a=1;'}],read:[]};
        return { terminal:'completed',reply,usage:{...emptyUsage(),total:10},threadId:null,turnId:null,observedModel:null,failure:null };
      }, async stop() { return {stopped:true}; } } });
    const result = await engine.run('Crie a.js',new AbortController().signal);
    assert.equal(result.status,'passed'); assert.deepEqual(efforts,['low','medium','high']);
    assert.equal(result.usage.total,30); assert.equal(await readFile(join(f.project,'a.js'),'utf8'),'export const a=1;');
    assert.deepEqual(result.attempts.slice(0,2).map(a=>a.changed),[[],[]]);
  } finally { await f.clean(); }
});


test('edição inválida não grava e é corrigida no próximo nível', async () => {
  const f=await fixture(); let calls=0;
  try {
    await mkdir(f.project,{recursive:true}); await writeFile(join(f.project,'a.js'),'old');
    const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,checker:{async check(){return pass;}},synthesis:{
      async synthesize(){calls++;return {terminal:'completed',reply:{kind:'edit',message:'fix',read:[],edits:[{path:'a.js',before:calls===1?'missing':'old',after:'new'}]},usage:{...emptyUsage(),total:10},threadId:null,turnId:null,observedModel:null,failure:null};},async stop(){return {stopped:true};}}});
    const report=await engine.run('Corrija a.js',new AbortController().signal);
    assert.equal(report.status,'passed');assert.equal(calls,2);assert.equal(report.attempts[0]?.status,'patch');
    assert.equal(report.usage.total,20);assert.equal(await readFile(join(f.project,'a.js'),'utf8'),'new');
  } finally {await f.clean();}
});

test('localiza CLI citada pelo teste sem incluir documentação no reparo',()=>{
  const files=[{path:'tests/cli.test.js',content:"resolve('src/cli.js')",hash:'x'},{path:'src/cli.js',content:'',hash:'x'},{path:'src/good.js',content:'',hash:'x'},{path:'README.md',content:'',hash:'x'}];
  assert.deepEqual(repairTargets({root:'.',files,omitted:0},['tests/cli.test.js'],['src/cli.js','src/good.js','README.md']),['src/cli.js']);
});


test('criações e comando de execução são registrados sem chamar ferramentas do modelo', async()=>{
  const f=await fixture();try{
    const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,checker:{async check(){return pass;}},synthesis:{async synthesize(){return {terminal:'completed',reply:{kind:'edit',message:'feito',read:[],edits:[{path:'package.json',before:'',after:JSON.stringify({type:'module',scripts:{start:'node src/cli.js'}})},{path:'src/cli.js',before:'',after:'console.log(42);'}]},usage:{...emptyUsage(),total:8},threadId:null,turnId:null,observedModel:null,failure:null};},async stop(){return{stopped:true};}}});
    const result=await engine.run('Crie calculadora',new AbortController().signal);assert.equal(result.status,'passed');assert.deepEqual(result.attempts[0]?.created,['package.json','src/cli.js']);assert.deepEqual(result.attempts[0]?.modified,[]);assert.equal(result.nextCommand,'npm start');
  }finally{await f.clean();}
});

test('resposta do modelo depois de falha não transforma verificação em aprovação',async()=>{
  const f=await fixture();let calls=0;try{
    const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,checker:{async check(){return{...pass,status:'failed',failure:'implementation',diagnostic:'AssertionError',failedFiles:['src/a.js'],passed:9,failed:3,tests:12};}},synthesis:{async synthesize(){calls++;return {terminal:'completed',reply:calls===1?{kind:'edit',message:'feito',read:[],edits:[{path:'src/a.js',before:'',after:'bad'}]}:{kind:'answer',message:'Está pronto.',read:[],edits:[]},usage:{...emptyUsage(),total:5},threadId:null,turnId:null,observedModel:null,failure:null};},async stop(){return{stopped:true};}}});
    const result=await engine.run('Crie a.js',new AbortController().signal);assert.equal(result.status,'failed');assert.equal(result.failure,'implementation');assert.equal(result.check?.passed,9);assert.equal(result.check?.failed,3);assert.equal(result.usage.total,10);
  }finally{await f.clean();}
});


test('limpeza não confirmada bloqueia a próxima tarefa e não inicia síntese concorrente',async()=>{
  const f=await fixture();let calls=0;try{
    const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,checker:{async check(){return pass;}},synthesis:{async synthesize(){calls++;return{terminal:'completed',reply:{kind:'answer',message:'ok',edits:[],read:[]},usage:{...emptyUsage(),total:2},threadId:null,turnId:null,observedModel:null,failure:null};},async stop(){return{stopped:false};}}});
    const result=await engine.run('Explique',new AbortController().signal);assert.equal(result.status,'failed');assert.equal(result.failure,'environment');await assert.rejects(engine.run('Outra tarefa',new AbortController().signal),/Encerramento anterior/);assert.equal(calls,1);
  }finally{await f.clean();}
});


test('falha real de rpc.close continua bloqueando a engine e o adaptador',async()=>{
  const {CodexSynthesis}=await import('../src/codex.js');const f=await fixture();let connects=0;
  let listener=(_method:string,_params:unknown)=>{};
  const rpc:import('../src/contracts.js').RpcClient={async request(method){if(method==='thread/start')return{thread:{id:'t'}};if(method==='account/rateLimits/read')return{};listener('item/completed',{threadId:'t',turnId:'u',item:{type:'agentMessage',text:JSON.stringify({kind:'answer',message:'ok',edits:[],read:[]})}});listener('turn/completed',{threadId:'t',turn:{id:'u',status:'completed'}});return{turn:{id:'u'}};},notify(){},onNotification(fn){listener=fn;return()=>{};},async close(){throw Error('tree uncertain');}};
  const port=new CodexSynthesis(async()=>{connects++;return rpc;},f.project);
  try{const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,synthesis:port,checker:{async check(){return pass;}}});
    const first=await engine.run('Explique',new AbortController().signal);assert.equal(first.failure,'environment');
    await assert.rejects(port.stop(),/Encerramento anterior/);await assert.rejects(engine.run('Outra',new AbortController().signal),/Encerramento anterior/);await assert.rejects(port.synthesize(config.profiles.economico,'Outra',new AbortController().signal),/Encerramento anterior/);assert.equal(connects,1);
  }finally{await f.clean();}
});


test('diagnóstico de site pergunta e orienta sem inferência, preservando intenção e foco',async()=>{
  const f=await fixture();let calls=0;const requests:string[]=[];try{
    await mkdir(f.project,{recursive:true});await mkdir(join(f.project,'src'));await writeFile(join(f.project,'index.html'),'<script type="module" src="/src/web.js"></script>');await writeFile(join(f.project,'src/web.js'),'console.log(1);');await writeFile(join(f.project,'src/server.js'),'createServer().listen(3000);');await writeFile(join(f.project,'package.json'),JSON.stringify({scripts:{start:'node src/cli.js',web:'node src/server.js'}}));await writeFile(join(f.project,'unrelated.txt'),'irrelevante');
    const engine=createProjectEngine({project:f.project,stateRoot:f.state,config,catalog,checker:{async check(){return pass;}},synthesis:{async synthesize(profile,input){calls++;assert.equal(profile.effort,'medium');requests.push(input);return{terminal:'completed',reply:{kind:'question',message:'Qual botão?',edits:[],read:[]},usage:{...emptyUsage(),total:9},threadId:null,turnId:null,observedModel:null,failure:null};},async stop(){return{stopped:true};}}});
    const question=await engine.run('Não está funcionando, não consigo clicar no site',new AbortController().signal);assert.equal(question.status,'question');assert.equal(question.usage.total,0);assert.equal(calls,0);
    const local=await engine.run('Abri o arquivo index.html diretamente',new AbortController().signal);assert.equal(local.status,'answer');assert.match(local.message,/npm run web/);assert.equal(calls,0);
    await engine.run('Não consigo clicar no site',new AbortController().signal);await engine.run('http://localhost:3000',new AbortController().signal);assert.equal(calls,1);const request=JSON.parse(requests[0]!);assert.match(request.request,/Não consigo clicar/);assert.ok(!request.files.some((file:{path:string})=>file.path==='unrelated.txt'));assert.equal(request.environmentEvidence.browserValidation,'not-run');
  }finally{await f.clean();}
});
