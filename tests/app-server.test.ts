import test from 'node:test';
import assert from 'node:assert/strict';
import { serverArgs } from '../src/app-server.js';
test('servidor auxiliar sem provedor autenticado; síntese com OAuth por env', () => {
  assert.equal(serverArgs(false).join(' ').includes('ACCESS_TOKEN'), false);
  assert.ok(serverArgs(true).includes('--strict-config'));
  assert.ok(serverArgs(true).includes('model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"'));
  assert.equal(serverArgs(true).some(v => v.includes('danger-full-access')), false);
});
