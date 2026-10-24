import type { Writable } from 'node:stream';
import type { CheckResult, ProjectReport } from './project-types.js';
import type { Profile, Usage, QuotaStatus } from './contracts.js';

export interface UiEvent {
  type: 'route' | 'thinking' | 'edit' | 'check' | 'repair' | 'done' | 'info' | 'error' | 'usage' | 'quota';
  message: string;
  profile?: Profile; attempt?: number; usage?: Usage; quota?: QuotaStatus;
}
export type TerminalOutput = Writable & { isTTY?: boolean; columns?: number };

/** Treat provider output as plain text; only this module may emit terminal controls. */
export function cleanTerminalText(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '');
}

const labels: Record<UiEvent['type'], string> = {
  route: 'Rota', thinking: 'Executando', edit: 'Arquivos', check: 'Verificação',
  repair: 'Reparo', done: 'Concluído', info: 'Relay', error: 'Falha', usage: 'Uso', quota: 'Cota da conta',
};
const palette: Record<UiEvent['type'], number> = {
  route: 36, thinking: 36, edit: 36, check: 36, repair: 33, done: 32, info: 36, error: 31, usage: 36, quota: 36,
};

const failures = {
  implementation: 'A alteração ainda não passou na verificação.',
  environment: 'A verificação encontrou um problema no ambiente.',
  access: 'Acesso necessário indisponível.',
  scope: 'A tarefa excedeu o escopo permitido.',
  inconclusive: 'Não foi possível confirmar o resultado.',
  limit: 'Limite da execução atingido.',
  cancelled: 'Execução cancelada.',
  integrity: 'A verificação detectou uma alteração protegida.',
};

function testSummary(check: CheckResult | null): string {
  if (!check) return 'Testes: não executados';
  if (check.status === 'unavailable') return 'Testes: indisponíveis';
  if (check.passed !== undefined || check.failed !== undefined) {
    const parts: string[] = [];
    if (check.passed !== undefined) parts.push(`${check.passed} passaram`);
    if (check.failed !== undefined) parts.push(`${check.failed} falharam`);
    return `Testes: ${parts.join(' · ')}`;
  }
  return check.status === 'passed' ? `Testes: ${check.tests} passaram` : `Testes: ${check.tests} executados · verificação falhou`;
}

function fileSummary(report: ProjectReport): string {
  const created = new Set(report.attempts.flatMap(attempt => attempt.created ?? []));
  const modified = new Set(report.attempts.flatMap(attempt => [...attempt.changed, ...(attempt.modified ?? [])]));
  for (const path of created) modified.delete(path);
  const paths = [...created, ...modified];
  if (!paths.length) return 'Arquivos: sem alterações';
  const counts = [created.size ? `${created.size} ${created.size === 1 ? 'criado' : 'criados'}` : '', modified.size ? `${modified.size} ${modified.size === 1 ? 'alterado' : 'alterados'}` : ''].filter(Boolean);
  const names = paths.slice(0, 5).join(', ') + (paths.length > 5 ? ` (+${paths.length - 5})` : '');
  return `Arquivos: ${counts.join(' · ')} · ${names}`;
}

export function createTerminal(output: TerminalOutput, options: { color?: boolean; width?: number } = {}) {
  const color = Boolean(output.isTTY) && options.color !== false && process.env.NO_COLOR === undefined;
  const width = Math.max(12, Math.min(100, Math.floor(options.width ?? output.columns ?? 76)));
  const paint = (value: string, code: number) => color ? `\x1b[${code}m${value}\x1b[0m` : value;
  const write = (value: string) => output.write(value);
  const line = (value = '') => write(cleanTerminalText(value) + '\n');
  const count = (value: number | null) => value === null ? 'indisponível' : value.toLocaleString('pt-BR');
  const tokens = (usage: Usage) => `${count(usage.total)} tokens`;
  const duration = (value: number) => `${(Math.max(0, value) / 1000).toFixed(1)}s`;
  const usageLine = (report: ProjectReport | null, conversationUsage?: Usage, reusedTasks = 0) => {
    const parts = [report ? `Tarefa: ${tokens(report.usage)}` : 'Tarefa: sem execução'];
    if (conversationUsage) parts.push(`Conversa: ${tokens(conversationUsage)}`, `Reaproveitadas: ${reusedTasks}`);
    else if (report?.cacheHit) parts.push('Reaproveitado: sem nova inferência');
    line(parts.join(' · '));
  };
  const event = (item: UiEvent) => {
    write(paint(`${labels[item.type]} ›`, palette[item.type]) + ' ' + cleanTerminalText(item.message) + '\n');
  };
  return {
    banner(project: string) {
      const inside = width - 4;
      const row = (text: string) => {
        const chars = Array.from(cleanTerminalText(text).replace(/\s+/g, ' '));
        const visible = chars.length > inside ? chars.slice(0, inside - 1).join('') + '…' : chars.join('');
        write(paint('│', 32) + ' ' + visible + ' '.repeat(Math.max(0, inside - Array.from(visible).length)) + ' ' + paint('│', 32) + '\n');
      };
      write(paint('╭' + '─'.repeat(width - 2) + '╮', 32) + '\n');
      row('RELAY · agente de projetos');
      row(project);
      write(paint('╰' + '─'.repeat(width - 2) + '╯', 32) + '\n');
      line('Descreva a tarefa. /help mostra comandos. Ctrl+C cancela a tarefa atual.');
    },
    event,
    report(report: ProjectReport, options: { conversationUsage?: Usage; reusedTasks?: number; interactive?: boolean; detailsPath?: string } = {}) {
      const completed = report.status === 'passed' && report.check?.status === 'passed';
      const heading = report.failure === 'cancelled' ? 'Cancelado'
        : report.status === 'question' ? 'Aguardando resposta'
        : report.status === 'answer' ? 'Resposta'
        : completed ? 'Concluído' : report.status === 'failed' || report.check?.status === 'failed' ? 'Falha' : 'Sem verificação';
      write(paint(heading, completed ? 32 : heading === 'Falha' ? 31 : 36) + '\n');
      if (report.status === 'answer' || report.status === 'question') line(report.message);
      else if (report.status === 'failed') {
        line(report.providerFailure?.message ?? (report.failure ? failures[report.failure] : cleanTerminalText(report.message).replace(/\s+/g, ' ').slice(0, 180)));
      }
      if ((report.status === 'answer' || report.status === 'question') && !report.check && !report.attempts.some(attempt => attempt.changed.length)) {
        usageLine(report, options.conversationUsage, options.reusedTasks); line(); return;
      }
      line(fileSummary(report));
      line(testSummary(report.check));
      usageLine(report, options.conversationUsage, options.reusedTasks);
      line(`Tempo: ${duration(report.durationMs)} · tentativas: ${report.attempts.length}`);
      if (report.providerFailure?.reason === 'authentication') line('Próximo: relay login e reabra a conversa.');
      else if (report.providerFailure?.reason === 'quota') line('Gerenciar uso: https://chatgpt.com/settings/usage');
      else if (report.providerFailure?.reason === 'forbidden') line('Próximo: confira a conta e o acesso ao modelo.');
      else if (report.nextCommand && completed) line(`Próximo: ${report.nextCommand}`);
      else if (options.interactive === false) { if (!completed && options.detailsPath) line(`Detalhes: ${options.detailsPath}`); }
      else if (report.status === 'question') line('Próximo: responda à pergunta.');
      else if (!completed && report.status !== 'answer') line('Próximo: /details');
      else if (report.backupId) line('Próximo: /undo para desfazer · /details para detalhes');
      else line('Próximo: envie outra mensagem.');
      line();
    },
    details(report: ProjectReport) {
      line(`Detalhes da tarefa ${report.id} · ${report.status}${report.failure ? ` · ${report.failure}` : ''}`);
      line(report.message);
      if (report.providerFailure) line(`Provedor: ${report.providerFailure.reason}${report.providerFailure.code ? ' · ' + report.providerFailure.code : ''}${report.providerFailure.httpStatus ? ' · HTTP ' + report.providerFailure.httpStatus : ''}`);
      line(fileSummary(report));
      line(testSummary(report.check));
      const checkDetails = (check: CheckResult | null) => {
        if (!check) return;
        line(`Confiança nos testes: ${check.trusted ? 'testes protegidos' : 'sem avaliador independente protegido'}`);
        if (check.failedFiles.length) line(`Arquivos com falha: ${check.failedFiles.join(', ')}`);
        if (check.diagnostic) line(check.diagnostic);
      };
      const metrics = (usage: Usage) => {
        line(`Tokens: ${count(usage.total)} · entrada: ${count(usage.input)} · saída: ${count(usage.output)}`);
        line(`Entrada em cache do provedor: ${count(usage.cachedInput)} · raciocínio: ${count(usage.reasoningOutput)}`);
      };
      metrics(report.usage);
      line(`Contexto enviado: ${count(report.contextBytes)} bytes · contexto completo: ${count(report.fullContextBytes)} bytes`);
      line(`Cache local: ${report.cacheHit ? 'reutilizado; sem nova inferência' : 'sem reuso'}`);
      line(`Tempo: ${duration(report.durationMs)} · tentativas: ${report.attempts.length}`);
      checkDetails(report.check);
      report.attempts.forEach((attempt, index) => {
        line(`Tentativa ${index + 1}: ${attempt.status} · ${attempt.level} · modelo: ${attempt.profile.model} · esforço: ${attempt.profile.effort} · ${duration(attempt.durationMs)}`);
        metrics(attempt.usage);
        line(`Contexto: ${count(attempt.contextBytes)} bytes`);
        const paths = [...new Set([...attempt.changed, ...(attempt.created ?? []), ...(attempt.modified ?? [])])];
        if (paths.length) line(`Arquivos: ${paths.join(', ')}`);
        line(testSummary(attempt.check));
        checkDetails(attempt.check);
      });
      if (report.backupId) line(`Backup: ${report.backupId} · /undo desfaz a última alteração`);
      if (report.nextCommand) line(`Próximo: ${report.nextCommand}`);
      line();
    },
    usage(report: ProjectReport | null, conversationUsage: Usage, reusedTasks: number, history: readonly ProjectReport[] = []) {
      usageLine(report, conversationUsage, reusedTasks);
      line('Gerenciar uso: https://chatgpt.com/settings/usage');
      line(`Conversa · entrada: ${count(conversationUsage.input)} · saída: ${count(conversationUsage.output)} · entrada em cache: ${count(conversationUsage.cachedInput)} · raciocínio: ${count(conversationUsage.reasoningOutput)}`);
      if (report) line(`Tarefa · entrada: ${count(report.usage.input)} · saída: ${count(report.usage.output)} · entrada em cache: ${count(report.usage.cachedInput)} · raciocínio: ${count(report.usage.reasoningOutput)}`);
      report?.attempts.forEach((attempt, index) => {
        line(`Tentativa ${index + 1}: ${tokens(attempt.usage)} · entrada: ${count(attempt.usage.input)} · saída: ${count(attempt.usage.output)} · entrada em cache: ${count(attempt.usage.cachedInput)}`);
      });
      if (history.length) {
        const start = Math.max(0, history.length - 20);
        line(`Consumo por tarefa (${history.length - start} de ${history.length}):`);
        history.slice(start).forEach((task, index) => {
          line(`Tarefa ${start + index + 1}: ${tokens(task.usage)}${task.cacheHit ? ' · reuso local' : ''}`);
        });
      }
    },
    help() {
      line('/help    Mostrar comandos');
      line('/status  Mostrar estado local, sem chamar IA');
      line('/details Mostrar detalhes da última tarefa');
      line('/usage   Mostrar consumo da tarefa e da conversa');
      line('/cancel  Cancelar a tarefa atual');
      line('/undo    Desfazer a última alteração com backup');
      line('/clear   Limpar a tela');
      line('/exit    Encerrar a conversa');
    },
    clear() { if (output.isTTY && process.env.NO_COLOR === undefined) write('\x1b[2J\x1b[H'); },
    promptLabel() { return paint('Você › ', 32); },
  };
}
