import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { cleanTerminalText, createTerminal, type TerminalOutput } from '../src/terminal-ui.js';
import type { ProjectReport } from '../src/project-types.js';

function capture(tty = false, columns = 60) {
  const output = new PassThrough() as TerminalOutput;
  output.isTTY = tty; output.columns = columns;
  let text = '';
  output.on('data', chunk => { text += String(chunk); });
  return { output, text: () => text };
}
const report: ProjectReport = {
  version: 1, id: 'sample', status: 'passed', message: 'Projeto pronto', failure: null,
  attempts: [], usage: { input: 100, output: 20, cachedInput: 50, reasoningOutput: null, total: 120 },
  contextBytes: 100, fullContextBytes: 1000, cacheHit: false,
  check: { status: 'passed', failure: null, diagnostic: '', failedFiles: [], tests: 3, trusted: true },
  durationMs: 1500, backupId: 'backup',
};

test('saída redirecionada permanece sem ANSI mesmo com cores solicitadas', () => {
  const c = capture();
  const ui = createTerminal(c.output, { color: true });
  ui.banner('C:/teste'); ui.event({ type: 'error', message: 'falhou' }); ui.clear(); ui.help();
  assert.ok(c.text().includes('RELAY'));
  assert.ok(c.text().includes('Falha › falhou'));
  assert.ok(c.text().includes('/status'));
  assert.ok(!c.text().includes('\x1b'));
});

test('banner adapta bordas à largura e permite desligar cores no TTY', () => {
  const c = capture(true, 24);
  createTerminal(c.output, { color: false }).banner('um projeto com nome muito grande');
  for (const line of c.text().split('\n').slice(0, 4)) assert.equal(Array.from(line).length, 24);
  assert.ok(!c.text().includes('\x1b'));
});

test('conteúdo não consegue injetar controles, hiperlinks ou direção de texto', () => {
  const unsafe = '\x1b[31mvermelho\x1b[0m\x1b]8;;https://invalido\x07link\x1b]8;;\x07\r\b\x00\u202e';
  assert.equal(cleanTerminalText(unsafe), 'vermelholink');
  const c = capture();
  createTerminal(c.output).event({ type: 'info', message: unsafe });
  assert.equal(c.text(), 'Relay › vermelholink\n');
});

test('relatório resume resultado e consumo sem expor diagnóstico ou métricas internas', () => {
  const c = capture(); createTerminal(c.output).report(report);
  assert.match(c.text(), /^Concluído\n/);
  assert.match(c.text(), /Tarefa: 120 tokens/);
  assert.match(c.text(), /Testes: 3 passaram/);
  assert.match(c.text(), /Tempo: 1.5s · tentativas: 0/);
  assert.match(c.text(), /\/undo/);
  assert.doesNotMatch(c.text(), /Contexto|raciocínio|cota|Projeto pronto|independente/);
});

test('NO_COLOR prevalece no TTY e métricas desconhecidas não viram zero', () => {
  const original = process.env.NO_COLOR;
  process.env.NO_COLOR = '';
  try {
    const c = capture(true);
    const ui = createTerminal(c.output);
    ui.report({ ...report, usage: { input: null, output: null, cachedInput: null, reasoningOutput: null, total: null } });
    ui.clear();
    assert.ok(!c.text().includes('\x1b'));
    assert.match(c.text(), /Tarefa: indisponível tokens/);
  } finally {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  }
});

test('falha parcial informa 9 aprovados e 3 falhos sem despejar TAP', () => {
  const c = capture();
  createTerminal(c.output).report({ ...report, status: 'failed', failure: 'implementation',
    check: { ...report.check!, status: 'failed', tests: 12, passed: 9, failed: 3, diagnostic: 'TAP version 13\nnot ok 4 - soma', failedFiles: ['soma.test.js'] },
    nextCommand: 'Corrija soma.js e tente novamente.',
  });
  assert.match(c.text(), /^Falha\n/);
  assert.match(c.text(), /Testes: 9 passaram · 3 falharam/);
  assert.match(c.text(), /Próximo: \/details/);
  assert.doesNotMatch(c.text(), /TAP|not ok|Concluído/);
});

test('falha sem contagens parciais não inventa quantos testes falharam', () => {
  const c = capture();
  createTerminal(c.output).report({ ...report, status: 'failed', failure: 'environment',
    check: { ...report.check!, status: 'failed', tests: 12 },
  });
  assert.match(c.text(), /12 executados · verificação falhou/);
  assert.doesNotMatch(c.text(), /12 falharam|12 passaram/);
});

test('resposta posterior a teste falho nunca anuncia conclusão', () => {
  const c = capture();
  createTerminal(c.output).report({ ...report, status: 'answer', message: 'A soma precisa de ajuste.',
    check: { ...report.check!, status: 'failed', tests: 12, passed: 9, failed: 3 },
  });
  assert.match(c.text(), /^Resposta\nA soma precisa de ajuste\./);
  assert.match(c.text(), /9 passaram · 3 falharam/);
  assert.doesNotMatch(c.text(), /Concluído/);
});

test('aprovação exige check aprovado e pergunta aguarda resposta', () => {
  const c = capture(); const ui = createTerminal(c.output);
  ui.report({ ...report, check: null, backupId: null });
  ui.report({ ...report, status: 'question', message: 'Qual arquivo?', check: null });
  assert.match(c.text(), /^Sem verificação\n/);
  assert.match(c.text(), /Aguardando resposta\nQual arquivo\?/);
  assert.match(c.text(), /Qual arquivo/);
  assert.doesNotMatch(c.text(), /Concluído/);
});

test('cancelamento tem estado direto', () => {
  const c = capture();
  createTerminal(c.output).report({ ...report, status: 'failed', failure: 'cancelled', check: null });
  assert.match(c.text(), /^Cancelado\n/);
  assert.doesNotMatch(c.text(), /Concluído/);
});

test('arquivos são únicos entre tentativas e criação prevalece sobre alteração', () => {
  const attempt = { level: 'light' as const, profile: { model: 'modelo', effort: 'low' }, usage: report.usage,
    status: 'passed', check: report.check, contextBytes: 100, durationMs: 100,
    changed: ['novo.js', 'antigo.js'], created: ['novo.js'], modified: ['antigo.js'] };
  const c = capture();
  createTerminal(c.output).report({ ...report, attempts: [attempt, { ...attempt, created: [], changed: ['novo.js'] }] });
  assert.match(c.text(), /Arquivos: 1 criado · 1 alterado · novo.js, antigo.js/);
  assert.doesNotMatch(c.text(), /Projeto pronto/);
});

test('diagnóstico, modelo, contexto e confiança ficam nos detalhes opt-in', () => {
  const diagnosticReport = { ...report, check: { ...report.check!, trusted: false, diagnostic: 'TAP version 13\nnot ok 2' },
    attempts: [{ level: 'light' as const, profile: { model: 'modelo-v2', effort: 'low' }, usage: report.usage,
      status: 'passed', changed: ['a.js'], check: report.check, contextBytes: 100, durationMs: 100 }] };
  const compact = capture(); createTerminal(compact.output).report(diagnosticReport);
  assert.doesNotMatch(compact.text(), /TAP|modelo-v2|raciocínio|Contexto|independente/);
  const detail = capture(); createTerminal(detail.output).details(diagnosticReport);
  assert.match(detail.text(), /TAP version 13\nnot ok 2/);
  assert.match(detail.text(), /modelo: modelo-v2 · esforço: low/);
  assert.match(detail.text(), /Tentativa 1/);
  assert.match(detail.text(), /Entrada em cache do provedor: 50 · raciocínio: indisponível/);
  assert.match(detail.text(), /Contexto enviado: 100 bytes · contexto completo: 1.000 bytes/);
  assert.match(detail.text(), /Confiança nos testes: sem avaliador independente protegido/);
});

test('reuso e consumo da conversa cabem em uma linha sem promessa de economia', () => {
  const c = capture();
  createTerminal(c.output).report({ ...report, cacheHit: true }, { conversationUsage: { ...report.usage, total: 1000 }, reusedTasks: 2 });
  assert.match(c.text(), /Tarefa: 120 tokens · Conversa: 1.000 tokens · Reaproveitadas: 2/);
  assert.doesNotMatch(c.text(), /economia|%|cota/);
  const local = capture(); createTerminal(local.output).report({ ...report, cacheHit: true });
  assert.match(local.text(), /Reaproveitado: sem nova inferência/);
});

test('/usage aceita conversa sem tarefa e preserva consumo desconhecido', () => {
  const c = capture();
  const unknown = { input: null, output: null, total: null, cachedInput: null, reasoningOutput: null };
  createTerminal(c.output).usage(null, unknown, 0);
  assert.match(c.text(), /Tarefa: sem execução · Conversa: indisponível tokens · Reaproveitadas: 0/);
  assert.match(c.text(), /entrada em cache: indisponível/);
  const known = capture(); createTerminal(known.output).usage(report, report.usage, 1);
  assert.match(known.text(), /Tarefa · entrada: 100 · saída: 20/);
});

test('/usage discrimina tentativas e limita histórico às últimas vinte tarefas', () => {
  const c = capture();
  const attempt = { level: 'light' as const, profile: { model: 'modelo', effort: 'low' }, usage: report.usage,
    status: 'passed', changed: [], check: report.check, contextBytes: 100, durationMs: 100 };
  const history = Array.from({ length: 22 }, (_, index) => ({ ...report, id: `id-${index}`, cacheHit: index === 21 }));
  createTerminal(c.output).usage({ ...report, attempts: [attempt] }, report.usage, 1, history);
  assert.match(c.text(), /Tentativa 1: 120 tokens · entrada: 100 · saída: 20 · entrada em cache: 50/);
  assert.match(c.text(), /Consumo por tarefa \(20 de 22\)/);
  assert.match(c.text(), /Tarefa 3: 120 tokens/);
  assert.match(c.text(), /Tarefa 22: 120 tokens · reuso local/);
  assert.doesNotMatch(c.text(), /\(id-0\)|\(id-1\)|Última/);
});

test('resumo, detalhes e comandos eliminam controles de conteúdo externo', () => {
  const c = capture(); const ui = createTerminal(c.output);
  const unsafe = '\x1b[31mconteúdo\x1b[0m\x1b]8;;https://invalido\x07\u202e';
  const input = { ...report, status: 'answer' as const, id: unsafe, message: unsafe, nextCommand: unsafe,
    check: { ...report.check!, diagnostic: unsafe, failedFiles: [unsafe] },
    attempts: [{ level: 'light' as const, profile: { model: unsafe, effort: unsafe }, usage: report.usage,
      status: unsafe, changed: [unsafe], check: null, contextBytes: 0, durationMs: 0 }] };
  ui.report(input); ui.details(input);
  assert.doesNotMatch(c.text(), /\x1b|\u202e|https:\/\/invalido/);
  assert.match(c.text(), /Próximo: conteúdo/);
});

test('ajuda lista comandos e TTY usa cores só quando permitido', () => {
  const c = capture(); createTerminal(c.output).help();
  for (const command of ['/status', '/details', '/usage', '/cancel', '/undo', '/clear', '/exit']) assert.ok(c.text().includes(command));
  const original = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const tty = capture(true); createTerminal(tty.output).report(report);
    assert.match(tty.text(), /\x1b\[32mConcluído\x1b\[0m/);
  } finally {
    if (original !== undefined) process.env.NO_COLOR = original;
  }
});


test('execução única aponta relatório sem sugerir comandos de chat',()=>{
  const c=capture();const ui=createTerminal(c.output);
  ui.report({...report,status:'failed',failure:'environment',nextCommand:'npm start'},{interactive:false,detailsPath:'C:/Relay/report.json'});
  assert.match(c.text(),/Detalhes: C:\/Relay\/report.json/);assert.doesNotMatch(c.text(),/Próximo: npm start|\/details|\/undo|envie outra mensagem/);
  const success=capture();createTerminal(success.output).report(report,{interactive:false});assert.doesNotMatch(success.text(),/\/details|\/undo|envie outra mensagem/);
});


test('acesso identifica limite, taxa e autenticação sem afirmar saldo desconhecido',()=>{
  for(const [reason,message]of [['quota','Limite de uso atingido.'],['rate','Muitas solicitações.'],['authentication','Sessão não autorizada.']] as const){
    const c=capture();createTerminal(c.output).report({...report,status:'failed',failure:'access',providerFailure:{kind:'access',reason,message}});
    assert.ok(c.text().includes(message));assert.ok(!c.text().includes('Acesso necessário indisponível'));
    if(reason==='quota')assert.match(c.text(),/https:\/\/chatgpt.com\/settings\/usage/);
    else assert.ok(!c.text().includes('Limite de uso atingido'));
  }
});
