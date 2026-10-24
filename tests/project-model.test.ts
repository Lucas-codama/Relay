import test from 'node:test'; import assert from 'node:assert/strict';
import { parseProjectReply } from '../src/project-model.js';
test('protocolo distingue alterações, conversa e contexto', () => {
  assert.equal(parseProjectReply({ kind: 'answer', message: 'Olá', edits: [], read: [] }).kind, 'answer');
  assert.equal(parseProjectReply({ kind: 'read', message: 'Preciso da função', edits: [], read: ['src/a.js'] }).kind, 'read');
  assert.throws(() => parseProjectReply({ kind: 'answer', message: 'x', edits: [{ path: 'a', before: '', after: 'x' }], read: [] }));
  assert.throws(() => parseProjectReply({ kind: 'edit', message: 'x', edits: [], read: [] }));
});
