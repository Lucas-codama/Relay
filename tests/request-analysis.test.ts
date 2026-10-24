import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRequest } from '../src/request-analysis.js';
import { classify, routes } from '../src/router.js';
const files = [
  { path: 'index.html', content: '<script type="module" src="/src/web.js"></script>', hash: 'x' },
  { path: 'src/web.js', content: 'import "./calculator.js";', hash: 'x' },
  { path: 'src/server.js', content: 'createServer().listen(3000);', hash: 'x' },
  { path: 'package.json', content: JSON.stringify({ scripts: { start: 'node src/cli.js', web: 'node src/server.js' } }), hash: 'x' },
];
const snapshot = { root: '.', files, omitted: 0 };
test('sintoma de clique exige evidência de abertura; arquivo direto recebe comando real', () => {
  const first = analyzeRequest('não está funcionando, não consigo clicar no site', snapshot);
  assert.equal(first.local?.kind, 'question'); assert.match(first.local!.message, /npm run web/);
  const answer = analyzeRequest('Abri o arquivo index.html diretamente', snapshot, first.intent);
  assert.equal(answer.local?.kind, 'answer'); assert.match(answer.local!.message, /npm run web/); assert.match(answer.local!.message, /localhost:3000/);
  const http = analyzeRequest('http://localhost:3000', snapshot, first.intent);
  assert.equal(http.local, null); assert.equal(http.webDebug, true); assert.ok(http.focus.includes('src/web.js'));
  assert.ok(!http.focus.includes('src/cli.js'));
  assert.equal(analyzeRequest('Abri o arquivo pelo servidor http://localhost:3000, mas o botão não funciona', snapshot).local, null);
  assert.equal(analyzeRequest('Abri o arquivo pelo servidor, mas o botão não funcionou', snapshot).local, null);
});
test('pedido novo não é substituído por orientação antiga e módulos ausentes não são inventados', () => {
  assert.equal(analyzeRequest('Mude a cor do título', snapshot, 'site não funciona').intent, 'Mude a cor do título');
  assert.equal(analyzeRequest('Crie um site sem erros', snapshot).local, null);
  const plain = { ...snapshot, files: files.map(f => f.path === 'index.html' ? { ...f, content: '<p>site</p>' } : f) };
  assert.equal(analyzeRequest('Não consigo clicar no site', plain).local, null);
});
test('dificuldade diferencia alteração simples, diagnóstico e falha persistente', () => {
  const config = { version: 1 as const, profiles: { economico: { model: 'small', effort: 'low' }, robusto: { model: 'large', effort: 'high' } } };
  const levels = routes(config, [{ model: 'small', efforts: ['low', 'medium'] }]);
  assert.equal(classify('Mude o título', snapshot, levels).level, 'light');
  assert.equal(classify('Não consigo clicar no botão', snapshot, levels).level, 'standard');
  assert.equal(classify('Ainda não consigo clicar no botão', snapshot, levels).level, 'deep');
  assert.equal(classify('Crie login com senha', snapshot, levels).level, 'deep');
});
