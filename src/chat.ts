import { createInterface, clearScreenDown, cursorTo, moveCursor } from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ProjectReport } from './project-types.js';
import { cleanTerminalText, createTerminal, type TerminalOutput, type UiEvent } from './terminal-ui.js';
import { createLiveStatus } from './live-status.js';
import { emptyUsage, sumUsage } from './usage.js';
import type { Usage } from './contracts.js';

export interface ChatOptions {
  input: Readable;
  output: TerminalOutput;
  project: string;
  signal: AbortSignal;
  run: (prompt: string, signal: AbortSignal, onEvent: (event: UiEvent) => void) => Promise<ProjectReport>;
  status?: () => string;
  undo?: () => Promise<string>;
}

/** One task at a time; local commands never wait for inference. */
export async function runChat(options: ChatOptions): Promise<void> {
  const terminal = createTerminal(options.output), live = createLiveStatus(options.output);
  const tty = Boolean((options.input as Readable & { isTTY?: boolean }).isTTY && options.output.isTTY);
  const reader = createInterface({ input: options.input, output: options.output, terminal: tty });
  const queue: string[] = [], history: ProjectReport[] = [];
  const zero = (): Usage => ({ input: 0, cachedInput: 0, output: 0, reasoningOutput: 0, total: 0 });
  let current: AbortController | null = null, currentUsage = emptyUsage(), currentStarted = 0;
  let total = zero(), reused = 0, finished = 0, draining = false, localAction = false;
  let closed = false, exiting = options.signal.aborted, settled = false;
  let lastReport: ProjectReport | null = null;
  let resolveDone!: () => void, rejectDone!: (error: unknown) => void;
  const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const checkDone = () => {
    if (!settled && (closed || exiting) && !draining && !localAction && !queue.length) { settled = true; resolveDone(); }
  };
  const prompt = () => {
    if (tty && !closed && !exiting && !current) { reader.setPrompt(terminal.promptLabel()); reader.prompt(true); }
  };
  function show(action: () => void) {
    live.pause();
    const editing = tty && !closed && Boolean(reader.line);
    if (editing && process.env.NO_COLOR === undefined) {
      const position = reader.getCursorPos();
      cursorTo(options.output, 0); if (position.rows) moveCursor(options.output, 0, -position.rows); clearScreenDown(options.output);
    }
    action();
    if (editing) { reader.setPrompt(terminal.promptLabel()); reader.prompt(true); }
    else if (current && !current.signal.aborted && !exiting) live.resume();
  }
  const info = (message: string) => show(() => terminal.event({ type: 'info', message }));
  const error = (message: string) => show(() => terminal.event({ type: 'error', message }));
  function activeReport(): ProjectReport | null {
    return current ? { version: 1, id: 'em andamento', status: 'answer', message: '', failure: null,
      attempts: [], usage: { ...currentUsage }, contextBytes: 0, fullContextBytes: 0,
      cacheHit: false, check: null, durationMs: performance.now() - currentStarted, backupId: null } : lastReport;
  }
  const conversationUsage = () => current ? sumUsage([total, currentUsage]) : total;
  function cancel() {
    if (!current) { info('Nenhuma tarefa em execução.'); return; }
    if (current.signal.aborted) return;
    live.stop(); current.abort(new Error('Cancelado pelo usuário.'));
    info('Cancelando…');
  }
  function onTyping(_text: string, key?: { name?: string; ctrl?: boolean }) {
    if (!current || current.signal.aborted || key?.ctrl && key.name === 'c') return;
    live.pause();
    // Preserve the readline buffer; further keystrokes edit it without animation.
    if (!reader.line && key?.name !== 'return' && key?.name !== 'enter') {
      reader.setPrompt(terminal.promptLabel()); reader.prompt(true);
    }
  }
  async function drain() {
    if (draining || localAction) return;
    draining = true;
    try {
      while (queue.length && !exiting) {
        const text = queue.shift()!;
        current = new AbortController(); currentUsage = emptyUsage(); currentStarted = performance.now();
        const job = current;
        if (tty && reader.line) show(() => { live.start(); live.pause(); }); else live.start();
        try {
          const received = await options.run(text, job.signal, item => {
            if (job.signal.aborted) return;
            if (item.usage) currentUsage = { ...item.usage };
            live.event(item);
          });
          const report: ProjectReport = job.signal.aborted ? { ...received, status: 'failed', failure: 'cancelled' } : received;
          total = sumUsage([total, report.usage]); if (report.cacheHit) reused++;
          lastReport = report; history.push(report); if (history.length > 20) history.shift();
          finished++;
          live.finish(report);
          show(() => terminal.report(report, { conversationUsage: total, reusedTasks: reused }));
        } catch (cause) {
          live.stop();
          total = sumUsage([total, currentUsage]);
          lastReport = { version: 1, id: randomUUID(), status: 'failed', message: cause instanceof Error ? cause.message : 'Falha na tarefa.',
            failure: job.signal.aborted ? 'cancelled' : 'environment', attempts: [], usage: { ...currentUsage }, contextBytes: 0,
            fullContextBytes: 0, cacheHit: false, check: null, durationMs: performance.now() - currentStarted, backupId: null };
          history.push(lastReport); if (history.length > 20) history.shift(); finished++;
          live.finish(lastReport);
          show(() => terminal.report(lastReport!, { conversationUsage: total, reusedTasks: reused }));
        } finally { live.stop(); current = null; }
      }
    } finally { draining = false; checkDone(); prompt(); }
  }
  const schedule = () => { void drain().catch(cause => { if (!settled) { settled = true; rejectDone(cause); } }); };
  function onLine(raw: string) {
    if (exiting) return;
    const text = cleanTerminalText(raw).trim();
    if (!text) { if (current) live.resume(); else prompt(); return; }
    if (text === '/exit' || text === '/quit') {
      exiting = true; queue.length = 0; if (current) cancel(); reader.close(); checkDone(); return;
    }
    if (text === '/cancel') { cancel(); prompt(); return; }
    if (text === '/status') {
      info(`${current ? current.signal.aborted ? 'Cancelando…' : live.status() : lastReport ? 'Pronto para outra tarefa.' : options.status?.() ?? 'Pronto.'}\nTarefas concluídas nesta conversa: ${finished}${queue.length ? ` · na fila: ${queue.length}` : ''}`);
      prompt(); return;
    }
    if (text === '/details') {
      show(() => {
        if (current) terminal.event({ type: 'info', message: live.details() });
        else if (lastReport) { terminal.details(lastReport); terminal.event({ type: 'info', message: live.details() }); }
        else terminal.event({ type: 'info', message: 'Nenhuma tarefa executada.' });
      }); prompt(); return;
    }
    if (text === '/usage') { show(() => terminal.usage(activeReport(), conversationUsage(), reused, history)); prompt(); return; }
    if (text === '/help') { show(terminal.help); prompt(); return; }
    if (text === '/clear') { live.pause(); terminal.clear(); if (current && !current.signal.aborted) live.resume(); else prompt(); return; }
    if (text === '/undo') {
      if (current || localAction) { info('Aguarde a tarefa ou use /cancel.'); return; }
      localAction = true;
      void Promise.resolve().then(() => options.undo ? options.undo() : 'Nenhuma alteração para desfazer.')
        .then(info, cause => error(cause instanceof Error ? cause.message : 'Não foi possível desfazer.'))
        .finally(() => { localAction = false; schedule(); checkDone(); });
      return;
    }
    if (text.startsWith('/')) { error('Comando desconhecido. Use /help.'); prompt(); return; }
    if (Buffer.byteLength(text) > 8192) { error('Pedido maior que 8 KiB.'); return; }
    if (queue.length >= 8) { error('Fila cheia. Aguarde ou use /cancel.'); return; }
    queue.push(text); if (current || localAction) info(`Na fila: ${queue.length}.`);
    schedule();
  }
  const onClose = () => { closed = true; checkDone(); };
  const abort = () => { exiting = true; queue.length = 0; current?.abort(options.signal.reason); live.stop(); reader.close(); checkDone(); };
  const interrupt = () => { if (current) cancel(); else { info('Use /exit para sair.'); prompt(); } };
  reader.on('line', onLine); reader.on('close', onClose); reader.on('SIGINT', interrupt);
  if (tty) options.input.prependListener('keypress', onTyping);
  options.signal.addEventListener('abort', abort, { once: true });
  terminal.banner(options.project);
  try {
    if (exiting) abort(); else prompt();
    await done;
  } finally {
    live.stop(); reader.removeListener('line', onLine); reader.removeListener('close', onClose); reader.removeListener('SIGINT', interrupt);
    options.input.removeListener('keypress', onTyping); options.signal.removeEventListener('abort', abort); reader.close();
  }
}
