#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, readFile, rename, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import type { FailureKind, RelayConfig, CredentialRecord } from './contracts.js';
import { createSessionStore, type RelaySessionStore } from './store.js';
import { ensureSession } from './auth.js';
import { readConfig, parseConfig } from './config.js';
import { startServer } from './app-server.js';
import { versions, doctor } from './doctor.js';
import { catalog, requireProfiles, type CatalogModel } from './models.js';
import { NativeSandbox } from './sandbox.js';
import { createVerifier } from './verify.js';
import { CodexSynthesis } from './codex.js';
import { runDemo } from './controller.js';
import { renderReport, saveReport } from './report.js';
import { assertRegular } from './fixture.js';
import { RelayError, failure } from './errors.js';
import { createWorkspace } from './workspace.js';
import { createProjectEngine, isTest, ensureProjectDirectory } from './project-engine.js';
import { NativeProjectChecker } from './project-sandbox.js';
import { projectInstructions, projectOutputSchema } from './project-model.js';
import { runChat } from './chat.js';
import { createTerminal } from './terminal-ui.js';
import { createLiveStatus } from './live-status.js';
import { cloneForBenchmark, compareReports } from './benchmark.js';
import { createTokenProvider } from './synthesis-session.js';
const help = `Relay — agente de projetos no terminal
  relay [chat] [--project DIR]
  relay run "Pedido para criar ou modificar o projeto" [--project DIR] [--max-turns 1..5] [--details]
  relay bench "Mesmo pedido para comparar" --project DIR [--max-turns 1..5] [--details]
  relay doctor
  relay login [--account ID]
  relay accounts
  relay models [--account ID]
  relay configure [--account ID]
  relay demo "Corrija o cálculo de desconto." [--account ID] [--max-turns 1|2] [--compare]
O login abre o navegador oficial. configure escolhe os dois perfis uma vez.
demo usa até dois turnos; --compare acrescenta uma referência robusta de um turno.
`;
export function exitCode(kind: FailureKind | null): number {
  return kind === null ? 0 : ({ implementation: 1, inconclusive: 1, integrity: 1, scope: 2, environment: 3, access: 4, limit: 5, cancelled: 130 })[kind];
}
export function parseCli(args: string[]) {
  try {
    const parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
      account: { type: 'string' }, compare: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      'max-turns': { type: 'string' },
      project: { type: 'string' }, details: { type: 'boolean' },
    } });
    const command = parsed.positionals[0] ?? 'chat';
    if (!['help', 'doctor', 'login', 'accounts', 'models', 'configure', 'demo', 'chat', 'run', 'bench'].includes(command)) throw new Error();
    if (parsed.values.compare && command !== 'demo') throw new Error();
    if (parsed.values.details && !['run', 'bench'].includes(command)) throw new Error();
    if (parsed.values['max-turns'] && (!['demo', 'run', 'chat', 'bench'].includes(command) || !(command === 'demo' ? ['1', '2'] : ['1', '2', '3', '4', '5']).includes(parsed.values['max-turns']))) throw new Error();
    if (parsed.values.account && !/^[a-f0-9]{64}$/.test(parsed.values.account)) throw new Error();
    const rest = parsed.positionals.slice(1);
    if (['demo', 'run', 'bench'].includes(command) ? rest.length !== 1 || !rest[0]?.trim() || Buffer.byteLength(rest[0]) > 8192 : rest.length > 0) throw new Error();
    return { command: parsed.values.help ? 'help' : command, prompt: rest[0], account: parsed.values.account,
      compare: parsed.values.compare === true, maxTurns: Number(parsed.values['max-turns'] ?? (command === 'demo' ? 2 : 5)),
      project: parsed.values.project, details: parsed.values.details === true };
  } catch { throw new RelayError('scope', 'Comando inválido. Use relay --help.'); }
}
function statePath(): string {
  if (!process.env.LOCALAPPDATA) throw new RelayError('environment', 'LOCALAPPDATA indisponível.');
  return resolve(process.env.LOCALAPPDATA, 'Relay');
}
async function selectAccount(store: RelaySessionStore, requested?: string): Promise<string | null> {
  const saved = await store.listRegistrations();
  if (requested) { if (!saved.some(v => v.id === requested)) throw new RelayError('access', 'Registro selecionado não existe.'); return requested; }
  if (saved.length > 1) throw new RelayError('scope', 'Há várias contas. Use relay accounts e escolha --account ID.');
  return saved[0]?.id ?? null;
}
async function getCatalog(store: RelaySessionStore, account: string | null, signal: AbortSignal): Promise<{ session: CredentialRecord; models: CatalogModel[] }> {
  const session = await ensureSession(store, account, signal);
  const catalogSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const cwd = join(store.root, 'synthesis-work'); await mkdir(cwd, { recursive: true }); await assertRegular(cwd);
  const rpc = await startServer({ home: join(store.root, 'synthesis-codex'), cwd, accessToken: session.accessToken }, catalogSignal);
  try { return { session, models: await catalog(rpc, catalogSignal) }; } finally { await rpc.close(); }
}
async function configure(models: CatalogModel[], store: RelaySessionStore, signal: AbortSignal): Promise<RelayConfig> {
  if (!process.stdin.isTTY) throw new RelayError('scope', 'Execute relay configure em um terminal interativo para escolher os perfis.');
  const choices = models.flatMap(m => m.efforts.map(effort => ({ model: m.model, effort })));
  if (choices.length < 2) throw new RelayError('access', 'Catálogo não oferece duas combinações para a prova.');
  for (const [i, choice] of choices.entries()) process.stdout.write(`${i + 1}. ${choice.model} / ${choice.effort}\n`);
  process.stdout.write('Catálogo do cliente; a listagem ainda não comprova acesso nem economia.\n');
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const economical = Number(await reader.question('Número do perfil econômico: ', { signal }));
    const robust = Number(await reader.question('Número do perfil robusto: ', { signal }));
    const config = parseConfig({ version: 1, profiles: { economico: choices[economical - 1], robusto: choices[robust - 1] } });
    await assertRegular(store.root);
    const temporary = join(store.root, 'profiles.new-' + process.pid + '.json');
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, join(store.root, 'profiles.json'));
    return config;
  } finally { reader.close(); }
}
export async function main(args: string[], overrides: { write?: (s: string) => void; signal?: AbortSignal; root?: string; doctor?: typeof doctor } = {}): Promise<number> {
  const write = overrides.write ?? ((s: string) => process.stdout.write(s));
  const aborter = new AbortController(), onInterrupt = () => aborter.abort();
  process.once('SIGINT', onInterrupt);
  const signal = overrides.signal ?? aborter.signal;
  try {
    const cli = parseCli(args);
    if (cli.command === 'help') { write(help); return 0; }
    const root = overrides.root ?? statePath();
    if (cli.command === 'doctor') {
      if (!overrides.doctor) await createSessionStore(root).getHostId();
      write(await (overrides.doctor ?? doctor)(root, AbortSignal.any([signal, AbortSignal.timeout(60_000)]))); return 0;
    }
    const store = createSessionStore(root);
    if (cli.command === 'accounts') { for (const item of await store.listRegistrations()) write(`${item.id}  ${item.label}\n`); return 0; }
    const account = await selectAccount(store, cli.account);
    if (cli.command === 'login') { write('Continue com ChatGPT no navegador oficial.\n'); await ensureSession(store, account, signal); write('Sessão Relay autorizada e protegida. Nenhuma inferência executada.\n'); return 0; }
    const v = await versions(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
    // Prove native containment before acquiring credentials or using subscription.
    const sandbox = new NativeSandbox(join(root, 'native'));
    if (cli.command === 'demo') { write('Verificando isolamento local...\n'); await sandbox.preflight(AbortSignal.any([signal, AbortSignal.timeout(60_000)])); }
    const { session, models } = await getCatalog(store, account, signal);
    const accessToken = createTokenProvider(session, (registration, s) => ensureSession(store, registration, s));
    if (cli.command === 'models') {
      for (const model of models) write(`${model.model}: ${model.efforts.join(', ')}\n`);
      write('Catálogo do cliente; acesso só é comprovado por um turno concluído.\n'); return 0;
    }
    if (cli.command === 'configure') { await configure(models, store, signal); write('Perfis salvos.\n'); return 0; }
    const profilePath = join(root, 'profiles.json');
    let config: RelayConfig;
    try { await readFile(profilePath); await assertRegular(profilePath); config = await readConfig(profilePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; config = await configure(models, store, signal); }
    requireProfiles(models, Object.values(config.profiles));
    if (cli.command === 'run' || cli.command === 'chat' || cli.command === 'bench') {
      const project = resolve(cli.project ?? process.cwd());
      const projectState = join(root, 'projects', createHash('sha256').update(project.toLowerCase()).digest('hex'));
      await ensureProjectDirectory(project);
      const snapshot = await createWorkspace(project, projectState).snapshot();
      const cwd = join(root, 'synthesis-work');
      const port = new CodexSynthesis(async s => startServer({ home: join(root, 'synthesis-codex'), cwd, accessToken: await accessToken(s) }, s), cwd,
        { instructions: projectInstructions, schema: projectOutputSchema });
      const engine = createProjectEngine({ project, stateRoot: projectState, config, catalog: models, synthesis: port,
        checker: new NativeProjectChecker(root, snapshot.files.filter(f => isTest(f.path))), maxTurns: cli.maxTurns });
      if (cli.command === 'bench') {
        const ui = createTerminal(process.stdout); ui.banner(project + ' · comparação isolada');
        const live = createLiveStatus(process.stdout);
        const before = await cloneForBenchmark(snapshot, projectState);
        const second = await cloneForBenchmark(snapshot, projectState);
        const make = (projectRoot: string, state: string, direct: boolean) => createProjectEngine({ project: projectRoot, stateRoot: state, config, catalog: models,
          synthesis: port, checker: new NativeProjectChecker(root, snapshot.files.filter(f => isTest(f.path))), maxTurns: direct ? 1 : cli.maxTurns, direct });
        live.start();
        const adaptive = await make(before.root, before.state, false).run(cli.prompt!, signal, live.event).then(report => { live.finish(report); return report; }).finally(live.stop); ui.report(adaptive, { interactive: false, detailsPath: join(before.state, 'last-report.json') });
        if (signal.aborted || ['access', 'environment', 'cancelled', 'limit'].includes(adaptive.failure ?? '')) return exitCode(adaptive.failure);
        live.start();
        const direct = await make(second.root, second.state, true).run(cli.prompt!, signal, live.event).then(report => { live.finish(report); return report; }).finally(live.stop); ui.report(direct, { interactive: false, detailsPath: join(second.state, 'last-report.json') });
        const comparison = compareReports(adaptive, direct);
        ui.event({ type: comparison.comparable && (comparison.savedTokens ?? 0) > 0 ? 'done' : 'info',
          message: comparison.comparable
            ? `Adaptativo: ${comparison.adaptiveTokens} tokens · direto: ${comparison.directTokens} · diferença: ${comparison.savedTokens} (${comparison.savedPercent}%).`
            : 'Comparação inconclusiva.' });
        const path = join(projectState, 'last-comparison.json'); await writeFile(path, JSON.stringify({ comparison, artifacts: { adaptive: before.root, direct: second.root }, adaptive, direct }, null, 2) + '\n');
        if (!comparison.comparable && !cli.details) write('Detalhes: ' + path + '\n');
        if (cli.details) { ui.details(adaptive); ui.details(direct); write(comparison.message + '\nComparação local: ' + path + '\n'); }
        return comparison.comparable ? 0 : 1;
      }
      if (cli.command === 'chat') {
        await runChat({ input: process.stdin, output: process.stdout, project, signal, run: engine.run, status: engine.status, undo: engine.undo });
        return 0;
      }
      const ui = createTerminal(process.stdout); ui.banner(project);
      const live = createLiveStatus(process.stdout); live.start();
      const result = await engine.run(cli.prompt!, signal, live.event).then(report => { live.finish(report); return report; }).finally(live.stop); ui.report(result, { interactive: false, detailsPath: join(projectState, 'last-report.json') });
      if (cli.details) { ui.details(result); write('Relatório local: ' + join(projectState, 'last-report.json') + '\n'); }
      return exitCode(result.failure);
    }
    const verifier = createVerifier(sandbox);
    const synthesisCwd = join(root, 'synthesis-work');
    const synthesis = new CodexSynthesis(async s => startServer({ home: join(root, 'synthesis-codex'), cwd: synthesisCwd, accessToken: await accessToken(s) }, s), synthesisCwd);
    const options = { mode: 'adaptive' as const, now: () => performance.now(), versions: v, prompt: cli.prompt!, maxTurns: cli.maxTurns as 1 | 2 };
    const adaptive = await runDemo(config, synthesis, verifier, options, signal);
    write(renderReport(adaptive)); write('Relatório local: ' + await saveReport(adaptive, root) + '\n');
    if (cli.compare && !signal.aborted && (adaptive.status === 'passed' || adaptive.failure === 'implementation')) {
      const reference = await runDemo(config, synthesis, verifier, { ...options, mode: 'reference' }, signal);
      write(renderReport(reference)); write('Relatório da referência: ' + await saveReport(reference, root) + '\n');
      if (reference.initialHash !== adaptive.initialHash) throw new RelayError('integrity', 'Cópias iniciais diferentes; comparação inválida.');
      if (reference.failure) return exitCode(reference.failure);
    }
    return exitCode(adaptive.failure);
  } catch (error) {
    const e = failure(error); write(`Relay: ${e.message}\n`); return exitCode(e.kind);
  } finally { process.removeListener('SIGINT', onInterrupt); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  process.exitCode = await main(process.argv.slice(2));
