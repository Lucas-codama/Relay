import test from 'node:test'; import assert from 'node:assert/strict';
import { routes, classify, nextRoute } from '../src/router.js';
const config = { version: 1 as const, profiles: { economico: { model: 'small', effort: 'low' }, robusto: { model: 'large', effort: 'high' } } };
const levels = routes(config, [{ model: 'small', efforts: ['low', 'medium', 'high'] }]);
const snapshot = { root: '.', files: [], omitted: 0 };
test('classificação local evita chamada extra e distingue risco', () => {
  assert.equal(classify('Crie uma lista de tarefas no terminal.', snapshot, levels).level, 'light');
  assert.equal(classify('Implemente autenticação OAuth.', snapshot, levels).level, 'deep');
  assert.equal(classify('Ajuste o título', snapshot, levels, 1).level, 'standard');
  assert.equal(nextRoute(levels[0]!, levels)?.level, 'standard');
  assert.equal(nextRoute(levels[2]!, levels), null);
});
