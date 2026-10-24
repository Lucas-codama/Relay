import test from 'node:test';
import assert from 'node:assert/strict';
import { addTask, completeTask, listTasks } from '../src/tasks.js';

test('adiciona título limpo com ID crescente sem modificar a entrada', () => {
  const original = [{ id: 3, title: 'Anterior', done: true }];
  const result = addTask(original, '  Comprar pão  ');
  assert.deepEqual(result, [...original, { id: 4, title: 'Comprar pão', done: false }]);
  assert.equal(original.length, 1);
  assert.deepEqual(addTask([], 'Primeira'), [{ id: 1, title: 'Primeira', done: false }]);
});
test('rejeita título vazio ou inválido', () => {
  for (const title of ['', '   ', null, 42]) assert.throws(() => addTask([], title), TypeError);
});
test('conclui sem alterar a entrada e rejeita ID desconhecido', () => {
  const original = [{ id: 1, title: 'Teste', done: false }];
  assert.deepEqual(completeTask(original, 1), [{ id: 1, title: 'Teste', done: true }]);
  assert.equal(original[0].done, false);
  assert.throws(() => completeTask(original, 99), RangeError);
});
test('lista all/open/done sem devolver o array original', () => {
  const tasks = [{ id: 1, title: 'A', done: false }, { id: 2, title: 'B', done: true }];
  assert.deepEqual(listTasks(tasks), tasks);
  assert.notEqual(listTasks(tasks), tasks);
  assert.deepEqual(listTasks(tasks, 'open'), [tasks[0]]);
  assert.deepEqual(listTasks(tasks, 'done'), [tasks[1]]);
  assert.throws(() => listTasks(tasks, 'invalid'), TypeError);
});
