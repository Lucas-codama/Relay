import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFailure } from '../src/project-sandbox.js';
test('erro do runtime permanece ambiente mesmo envolto em AssertionError de testes', () => {
  assert.equal(projectFailure("AssertionError: status 1 !== 0\nError: EPERM: operation not permitted, lstat 'C:\\'\n at toRealPath (node:internal/modules/helpers)", 12), 'environment');
  assert.equal(projectFailure('AssertionError: expected 42, actual 7', 12), 'implementation');
  assert.equal(projectFailure('sandbox unavailable', 0), 'environment');
});
