import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, posix, resolve, dirname } from 'node:path';
import type { RelayConfig, SynthesisPort, Usage } from './contracts.js';
import type { CatalogModel } from './models.js';
import type { ProjectSnapshot, ProjectReport, CheckResult, ProjectAttempt } from './project-types.js';
import { createWorkspace, selectContext, safeRelativePath } from './workspace.js';
import type { ProjectChecker } from './project-sandbox.js';
import { routes, classify, nextRoute } from './router.js';
import { parseProjectReply } from './project-model.js';
import { checkAbort, RelayError, failure } from './errors.js';
import { emptyUsage, sumUsage } from './usage.js';
import type { UiEvent } from './terminal-ui.js';
import { assertRegular } from './fixture.js';
import { analyzeRequest } from './request-analysis.js';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const isTest = (path: string) => /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?js$/i.test(path);
export async function ensureProjectDirectory(path: string): Promise<void> {
  const target = resolve(path); let existing = target;
  while (true) {
    try { await lstat(existing); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const parent = dirname(existing); if (parent === existing) throw error; existing = parent; }
  }
  await assertRegular(existing); await mkdir(target, { recursive: true }); await assertRegular(target);
}
export function repairTargets(snapshot: ProjectSnapshot, failedFiles: readonly string[], changed: readonly string[]): string[] {
  const files = new Map(snapshot.files.map(f => [f.path, f])); const targets = new Set<string>();
  const queue = [...failedFiles];
  for (let i = 0; i < queue.length && i < 100; i++) {
    const name = queue[i]!, file = files.get(name);
    if (!isTest(name) && changed.includes(name)) targets.add(name);
    if (!file) continue;
    for (const match of file.content.matchAll(/(?:from\s*|import\s*\(|require\s*\()['"](\.[^'"]+)['"]/g)) {
      const base = posix.normalize(posix.join(posix.dirname(name), match[1]!));
      const source = [base, base + '.js', base + '.mjs', base + '/index.js'].find(p => files.has(p));
      if (source && !queue.includes(source)) queue.push(source);
      else if (!source && /\.[cm]?js$/.test(base)) { try { targets.add(safeRelativePath(base)); } catch {} }
    }
    for (const match of file.content.matchAll(/['"]([^'"\n]+\.[cm]?js)['"]/g)) {
      const literal = match[1]!;
      const candidate = literal.startsWith('.') ? posix.normalize(posix.join(posix.dirname(name), literal)) : literal;
      if (files.has(candidate) && !queue.includes(candidate)) queue.push(candidate);
    }
  }
  if (!targets.size) for (const name of changed) if (!isTest(name) && /\.[cm]?js$/.test(name)) targets.add(name);
  return [...targets].filter(name => !isTest(name) && !/(?:^|\/)(?:package(?:-lock)?\.json|[^/]*config[^/]*)$/.test(name));
}
export interface ProjectEngineOptions {
  project: string; stateRoot: string; config: RelayConfig; catalog: CatalogModel[];
  synthesis: SynthesisPort; checker: ProjectChecker; maxTurns?: number; direct?: boolean;
}
export function createProjectEngine(options: ProjectEngineOptions) {
  const workspace = createWorkspace(options.project, options.stateRoot);
  let last: ProjectReport | null = null, lastSummary = '', active = false, lastBackupId: string | null = null;
  let cleanupUnconfirmed = false;
  let pendingWebIssue: string | undefined, previousRequest = '';
  async function stopSynthesis() {
    try { if (!(await options.synthesis.stop()).stopped) throw new Error('stop'); }
    catch { cleanupUnconfirmed = true; throw new RelayError('environment', 'Encerramento não confirmado; nenhuma nova tarefa será iniciada.'); }
  }
  const protectedTests = new Map<string, string>();
  const zero = (): Usage => ({ input: 0, cachedInput: 0, output: 0, reasoningOutput: 0, total: 0 });
  async function run(prompt: string, callerSignal: AbortSignal, emit: (event: UiEvent) => void = () => {}): Promise<ProjectReport> {
    if (cleanupUnconfirmed) throw new RelayError('environment', 'Encerramento anterior não confirmado; execução bloqueada.');
    if (active) throw new RelayError('integrity', 'Há uma tarefa em andamento neste projeto.');
    if (!prompt.trim() || Buffer.byteLength(prompt) > 8192) throw new RelayError('scope', 'Pedido vazio ou maior que 8 KiB.');
    active = true; const started = performance.now(), attempts: ProjectAttempt[] = [];
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(600_000)]);
    const report: ProjectReport = { version: 1, id: randomUUID(), status: 'failed', message: '', failure: null,
      attempts, usage: emptyUsage(), contextBytes: 0, fullContextBytes: 0, cacheHit: false, check: null, durationMs: 0, backupId: null };
    try {
      checkAbort(signal); await mkdir(options.stateRoot, { recursive: true }); await ensureProjectDirectory(options.project);
      let snapshot = await workspace.snapshot();
      const analysis = analyzeRequest(prompt, snapshot, pendingWebIssue);
      pendingWebIssue = undefined;
      if (!options.direct && analysis.local) {
        if (analysis.local.kind === 'question') pendingWebIssue = analysis.intent.slice(0, 1000);
        Object.assign(report, { status: analysis.local.kind, message: analysis.local.message, usage: zero() });
        return report;
      }
      for (const file of snapshot.files.filter(f => isTest(f.path))) protectedTests.set(file.path.toLowerCase(), file.hash);
      const levels = routes(options.config, options.catalog);
      let route = options.direct ? levels.at(-1)! : classify(analysis.intent, snapshot, levels, last?.failure === 'implementation' ? 1 : 0);
      const fingerprint = () => digest([prompt.trim(), snapshot.files.map(f => [f.path, f.hash]), options.config, 'project-v1']);
      const key = fingerprint(); const cachePath = join(options.stateRoot, 'cache.json');
      if (!options.direct) try {
        const cached = JSON.parse(await readFile(cachePath, 'utf8'));
        if (cached.key === key && cached.report?.status === 'passed') {
          const checked = await options.checker.check(snapshot, signal);
          if (checked.status === 'passed') {
            Object.assign(report, { status: 'passed', message: 'Resultado idêntico reutilizado após repetir os testes locais.', usage: zero(), cacheHit: true, check: checked });
            return report;
          }
        }
      } catch (error) { if (signal.aborted) throw error; }
      if (/^(?:oi|ol[aá]|obrigad[oa]|bom dia|boa tarde|boa noite)[!.?]*$/i.test(prompt.trim())) {
        Object.assign(report, { status: 'answer', message: 'Olá! Descreva o projeto ou a mudança desejada. Eu seleciono a capacidade e verifico os arquivos; /help mostra os comandos locais.', usage: zero() }); return report;
      }
      let changed: string[] = [], allowedRepair: string[] | undefined, check: CheckResult | null = null;
      let extraPaths: string[] = [], reads = 0;
      for (let turn = 0; turn < (options.maxTurns ?? 5); turn++) {
        checkAbort(signal);
        if ((sumUsage(attempts.map(a => a.usage)).total ?? 0) >= 80_000) throw new RelayError('limit', 'Orçamento observado de 80 mil tokens atingido.');
        const context = selectContext(snapshot, analysis.intent, [...(check?.failedFiles ?? []), ...(allowedRepair ?? []), ...extraPaths, ...analysis.focus], 24 * 1024, allowedRepair !== undefined || analysis.focus.length > 0);
        if (extraPaths.some(p => !context.files.some(f => f.path === p))) throw new RelayError('scope', 'Os arquivos necessários excedem o orçamento de contexto; divida a mudança.');
        const request = JSON.stringify({ request: analysis.intent, previousRequest, previousSummary: lastSummary,
          environmentEvidence: { webDebug: analysis.webDebug, command: analysis.command, url: analysis.url, browserValidation: 'not-run' },
          inventory: snapshot.files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content) })), inventoryOmitted: snapshot.omitted,
          files: context.files.map(f => ({ path: f.path, content: f.content })),
          protectedTests: [...protectedTests.keys()], allowedRepairPaths: allowedRepair ?? null,
          verificationFailure: check?.diagnostic ?? null });
        if (Buffer.byteLength(request) > 48 * 1024) throw new RelayError('scope', 'Pedido/contexto excede 48 KiB.');
        report.contextBytes += context.bytes; report.fullContextBytes += context.fullBytes;
        emit({ type: 'route', message: `${route.level} · ${route.profile.model}/${route.profile.effort} · ${route.reason}`, profile: route.profile, attempt: turn + 1 });
        const attempt: ProjectAttempt = { level: route.level, profile: route.profile, usage: emptyUsage(), status: 'running', changed: [], check: null, contextBytes: context.bytes, durationMs: 0 };
        const turnStarted = performance.now(); attempts.push(attempt);
        try {
          emit({ type: 'thinking', message: 'Preparando alterações com contexto selecionado.' });
          const result = await options.synthesis.synthesize(route.profile, request, AbortSignal.any([signal, AbortSignal.timeout(180_000)]), progress => {
            if (signal.aborted) return;
            if (progress.type === 'usage') {
              attempt.usage = { ...progress.usage };
              emit({ type: 'usage', message: 'Última atualização de tokens recebida do Codex.', usage: sumUsage(attempts.map(a => a.usage)) });
            } else if (progress.type === 'quota') emit({ type: 'quota', message: 'Cota compartilhada da conta; não representa apenas esta tarefa.', quota: progress.quota });
            else emit({ type: 'info', message: `Provedor redirecionou para ${progress.model}.`, profile: { ...route.profile, model: progress.model } });
          });
          attempt.usage = result.usage;
          await stopSynthesis();
          checkAbort(signal);
          if (result.terminal !== 'completed') throw new RelayError(result.failure ?? 'inconclusive', result.providerFailure?.message ?? 'O modelo não concluiu o turno.', result.providerFailure);
          let reply;
          try { reply = parseProjectReply(result.reply); }
          catch (error) {
            if (!(error instanceof RelayError) || error.kind !== 'inconclusive') throw error;
            const next = nextRoute(route, levels);
            if (!next) throw error;
            attempt.status = 'format';
            check = { status: 'failed', failure: 'implementation', diagnostic: 'A resposta anterior violou o protocolo. Retorne kind edit com alterações não vazias; answer/question com edits/read vazios; read somente para arquivos existentes omitidos do contexto.', failedFiles: [], tests: 0, trusted: false };
            route = next; emit({ type: 'repair', message: 'Resposta estruturada inválida; aumentando a capacidade sem alterar arquivos.' }); continue;
          }
          report.message = reply.message;
          if (reply.kind === 'answer' || reply.kind === 'question') {
            report.status = reply.kind; attempt.status = reply.kind;
            if (reply.kind === 'answer' && report.check?.status === 'failed') {
              report.status = 'failed'; report.failure = report.check.failure ?? 'implementation';
            }
            return report;
          }
          if (reply.kind === 'read') {
            if (++reads > 2) throw new RelayError('limit', 'Limite de pedidos adicionais de contexto atingido.');
            extraPaths = (reply.read ?? []).map(safeRelativePath);
            if (extraPaths.some(p => !snapshot.files.some(f => f.path === p))) {
              extraPaths = []; attempt.status = 'context-missing';
              check = { status: 'failed', failure: 'implementation', diagnostic: 'Os caminhos solicitados não existem no inventário acessível. Crie arquivos novos com before="". Não solicite leituras de caminhos ausentes.', failedFiles: [], tests: 0, trusted: false };
              const next = nextRoute(route, levels); if (!next) throw new RelayError('scope', check.diagnostic);
              route = next; emit({ type: 'repair', message: 'Pedido de contexto inválido; aumentando a capacidade sem alterar arquivos.' });
            }
            attempt.status = 'context'; continue;
          }
          if (reply.edits.some(e => protectedTests.has(safeRelativePath(e.path).toLowerCase()))) throw new RelayError('integrity', 'O modelo tentou alterar testes protegidos; nenhum arquivo foi aplicado.');
          checkAbort(signal);
          let applied;
          const existing = new Set(snapshot.files.map(file => file.path.toLowerCase()));
          try { applied = await workspace.apply(reply.edits, allowedRepair); }
          catch (error) {
            if (!(error instanceof RelayError) || error.kind !== 'implementation') throw error;
            const next = nextRoute(route, levels); if (!next) throw error;
            attempt.status = 'patch';
            check = { status: 'failed', failure: 'implementation', diagnostic: `${error.message} Use um único trecho exato por arquivo existente, sem criar novamente arquivos presentes. ${report.check?.diagnostic ?? ''}`.slice(0, 6000), failedFiles: report.check?.failedFiles ?? [], tests: report.check?.tests ?? 0, trusted: report.check?.trusted ?? false };
            route = next; emit({ type: 'repair', message: 'Edição não aplicada por inconsistência; aumentando capacidade com os arquivos preservados.' }); continue;
          }
          report.backupId = applied.backupId; lastBackupId = applied.backupId; attempt.changed = applied.changed;
          attempt.created = applied.changed.filter(path => !existing.has(path.toLowerCase()));
          attempt.modified = applied.changed.filter(path => existing.has(path.toLowerCase()));
          changed = [...new Set([...changed, ...applied.changed])];
          emit({ type: 'edit', message: applied.changed.join(', ') });
          snapshot = await workspace.snapshot();
          try {
            const manifest = snapshot.files.find(file => file.path === 'package.json');
            const launch = analyzeRequest(analysis.intent, snapshot);
            if (launch.command && /site|p[aá]gina|\bweb\b|navegador|bot[aã]o|clic/i.test(analysis.intent)) report.nextCommand = launch.command;
            else if (manifest && typeof JSON.parse(manifest.content)?.scripts?.start === 'string') report.nextCommand = 'npm start';
          } catch { /* A malformed manifest is handled by verification. */ }
          emit({ type: 'check', message: 'Executando testes em cópia isolada e sem credenciais.' });
          check = await options.checker.check(snapshot, signal); report.check = check; attempt.check = check;
          if (check.status === 'passed') {
            report.status = 'passed'; report.failure = null; attempt.status = 'passed';
            if (!check.trusted) report.message += ' Testes gerados passaram; ainda exigem revisão humana dos requisitos.';
            report.usage = sumUsage(attempts.map(a => a.usage));
            await writeFile(cachePath, JSON.stringify({ key: fingerprint(), report }) + '\n');
            return report;
          }
          attempt.status = check.status;
          if (check.status === 'unavailable') { report.failure = 'scope'; report.message += ' ' + check.diagnostic; return report; }
          if (check.failure !== 'implementation') throw new RelayError(check.failure ?? 'environment', check.diagnostic);
          const next = nextRoute(route, levels);
          if (!next) throw new RelayError('implementation', 'Os testes continuam falhando no nível máximo; arquivos e backups preservados.');
          allowedRepair = repairTargets(snapshot, check.failedFiles, changed);
          if (!allowedRepair.length) throw new RelayError('scope', 'Não foi possível localizar uma correção sem alterar o avaliador.');
          route = next; extraPaths = [];
          emit({ type: 'repair', message: `Escalando apenas ${allowedRepair.join(', ')}; outros arquivos e testes permanecem protegidos.` });
        } finally { attempt.durationMs = performance.now() - turnStarted; }
      }
      throw new RelayError('limit', 'Limite de turnos da tarefa atingido.');
    } catch (error) {
      const e = failure(error); report.failure = e.kind; report.message = e.message; report.status = 'failed';
      if (e.providerFailure) report.providerFailure = e.providerFailure;
      return report;
    } finally {
      try { await stopSynthesis(); } catch { report.status = 'failed'; report.failure = 'environment'; report.message = 'Encerramento não confirmado; nenhuma nova tentativa será iniciada.'; }
      report.durationMs = performance.now() - started;
      if (!report.cacheHit && attempts.length) report.usage = sumUsage(attempts.map(a => a.usage));
      for (const attempt of attempts) if (attempt.status === 'running') attempt.status = 'failed';
      last = report; lastSummary = report.message.slice(0, 600) + ' Arquivos: ' + [...new Set(attempts.flatMap(a => a.changed))].join(', ').slice(0, 600);
      previousRequest = prompt.slice(0, 1000);
      await writeFile(join(options.stateRoot, 'last-report.json'), JSON.stringify(report, null, 2) + '\n').catch(() => undefined);
      active = false;
    }
  }
  return { run, async undo() {
    if (!lastBackupId || active) throw new RelayError('scope', 'Não há alteração disponível para desfazer.');
    const files = await workspace.undo(lastBackupId); lastBackupId = null; if (last) last.backupId = null; lastSummary = ''; return files.join(', ');
  }, status: () => last ? `${last.status} · ${last.attempts.length} chamadas · ${last.usage.total ?? 'tokens indisponíveis'}` : 'Nenhuma tarefa executada.' };
}
