import type { Usage, QuotaStatus } from './contracts.js';
import type { ProjectReport } from './project-types.js';
import { cleanTerminalText, createTerminal, type TerminalOutput, type UiEvent } from './terminal-ui.js';

const stages: Partial<Record<UiEvent['type'], string>> = {
  route: 'Preparando', thinking: 'Gerando', edit: 'Arquivos aplicados',
  check: 'Testando', repair: 'Reparando', done: 'Concluído', error: 'Falhou',
};
const number = (value: number | null | undefined) => value == null ? '-' : value.toLocaleString('pt-BR');
const plain = (text: string) => cleanTerminalText(text).replace(/\s+/g, ' ').trim();
const bounded = (text: string, max = 2048) => Array.from(plain(text)).slice(0, max).join('');
function messageText(text: string): string {
  return bounded(cleanTerminalText(text).replace(/```[\s\S]*?(?:```|$)/g, '[código omitido]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [oculto]')
    .replace(/\b(?:sk-[\w-]{8,})\b/g, '[oculto]')
    .replace(/\b((?:access|refresh|id)[_-]?token|api[_-]?key|password|secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[oculto]'));
}
function quotaText(quota: QuotaStatus | null, detailed = false): string {
  if (quota?.state !== 'available') return 'Cota: indisponível';
  return quota.windows.map(w => {
    const minutes = w.windowDurationMins;
    const duration = minutes === null ? '' : minutes > 0 && minutes % 10080 === 0 ? `${minutes / 10080} sem` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}min`;
    const reset = detailed && w.resetsAt !== null ? `; renova ${new Date(w.resetsAt * 1000).toLocaleString('pt-BR')}` : '';
    return `${detailed ? `${plain(w.bucket)}/${w.window}: ` : ''}${Math.max(0, 100 - w.usedPercent)}% restante${duration || reset ? ` (${duration}${reset})` : ''}`;
  }).join(' · ');
}
// Avoid wrapping wide glyphs or splitting combining characters on narrow terminals.
function fit(text: string, width: number): string {
  const units = Array.from(text);
  const cells = (char: string) => /\p{Mark}/u.test(char) ? 0 : /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(char) ? 2 : 1;
  if (units.reduce((sum, char) => sum + cells(char), 0) <= width) return text;
  let result = '', used = 0;
  for (const char of units) {
    const size = cells(char);
    if (used + size > width - 1) break;
    result += char; used += size;
  }
  return result + '…';
}

/** Passive display: animation never makes inference or quota requests. */
export function createLiveStatus(output: TerminalOutput, options: { now?: () => number; refreshMs?: number } = {}) {
  const ui = createTerminal(output), now = options.now ?? (() => performance.now());
  const animated = Boolean(output.isTTY) && process.env.NO_COLOR === undefined;
  let started = 0, stoppedAt = 0, active = false, paused = false, stage = 'Preparando', attempt = 0, model = '';
  let usage: Usage | null = null, quota: QuotaStatus | null = null;
  let timer: ReturnType<typeof setInterval> | undefined, frame = 0, painted = false;
  let lastUsage = '', lastUsagePrint = -Infinity, lastState = '', lastQuota = '';
  const history: string[] = [];
  let historyBytes = 0;
  const clear = () => { if (painted) { output.write('\r\x1b[2K'); painted = false; } };
  function remember(item: UiEvent) {
    const message = messageText(item.message);
    if (!message) return;
    const line = `${item.type}: ${message}`;
    if (history.at(-1) === line) return;
    history.push(line); historyBytes += Buffer.byteLength(line, 'utf8') + 1;
    while (history.length > 50 || historyBytes > 16 * 1024) historyBytes -= Buffer.byteLength(history.shift()!, 'utf8') + 1;
  }
  function summary(): string {
    const seconds = Math.max(0, Math.floor(((active ? now() : stoppedAt) - started) / 1000));
    return `${stage} · ${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}${model ? ` · ${model}` : ''} · tentativa ${attempt || '-'} · tokens: ${number(usage?.total)}`;
  }
  function draw() {
    if (!active || paused || !animated) return;
    const width = Math.max(1, Math.floor(output.columns ?? 100) - 1);
    const text = fit(plain(`${['⠋', '⠙', '⠹', '⠸'][frame++ % 4]} ${summary()}`), width);
    clear(); output.write(`\x1b[36m${text}\x1b[0m`); painted = true;
  }
  function startTimer() {
    if (!animated || !active || paused || timer) return;
    draw(); timer = setInterval(draw, options.refreshMs ?? 250); timer.unref();
  }
  function pause() { paused = true; if (timer) clearInterval(timer); timer = undefined; clear(); }
  function stop() {
    if (active) stoppedAt = now();
    pause(); active = false;
  }
  function snapshot() {
    return `${summary()}\nEntrada: ${number(usage?.input)} · saída: ${number(usage?.output)} · cache: ${number(usage?.cachedInput)} · raciocínio: ${number(usage?.reasoningOutput)}\n${quotaText(quota, true)}`;
  }
  return {
    start() {
      stop(); started = now(); stoppedAt = started; active = true; paused = false;
      stage = 'Preparando'; attempt = 0; model = ''; usage = null; quota = null; frame = 0;
      lastUsage = ''; lastUsagePrint = -Infinity; lastState = ''; lastQuota = ''; history.length = 0; historyBytes = 0;
      startTimer();
    },
    pause,
    resume() { if (active) { paused = false; startTimer(); } },
    event(item: UiEvent) {
      if (!active) return;
      remember(item);
      if (item.profile) model = `${bounded(item.profile.model, 100)}/${bounded(item.profile.effort, 40)}`;
      if (item.attempt) attempt = item.attempt;
      if (item.usage) usage = { ...item.usage };
      if (stages[item.type]) stage = stages[item.type]!;
      if (item.type === 'quota') quota = item.quota ? { ...item.quota, windows: item.quota.windows.slice(0, 32).map(w => ({ ...w, bucket: bounded(w.bucket, 80) })) } : null;
      if (paused) return;
      if (item.type === 'quota') {
        const text = quotaText(quota);
        if (quota?.state === 'available' && text && text !== lastQuota) {
          clear(); ui.event({ type: 'quota', message: text }); lastQuota = text;
        }
      } else if (item.type === 'usage') {
        const signature = JSON.stringify(usage);
        if (!animated && signature !== lastUsage && now() - lastUsagePrint >= 1000) {
          ui.event({ type: 'usage', message: summary() });
          lastUsage = signature; lastUsagePrint = now();
        }
      } else if (!animated && stages[item.type] && item.type !== 'done') {
        const state = `${stage}/${model}/${attempt}`;
        if (state !== lastState) { ui.event({ type: 'info', message: summary() }); lastState = state; }
      }
      draw();
    },
    finish(report?: ProjectReport) {
      if (report) {
        stage = report.failure === 'cancelled' ? 'Cancelado' : report.status === 'failed' || report.check?.status === 'failed' ? 'Falhou'
          : report.status === 'question' ? 'Aguardando resposta' : report.status === 'answer' ? 'Resposta' : 'Concluído';
        usage = { ...report.usage };
      }
      stop();
    },
    stop,
    status: summary,
    snapshot,
    details() {
      return `${snapshot()}${quota ? `\nCota lida em: ${new Date(quota.updatedAt).toLocaleString('pt-BR')}` : ''}${history.length ? `\nMensagens e diagnóstico:\n${history.join('\n')}` : ''}`;
    },
  };
}


