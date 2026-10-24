import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
const valid = { version: 1, profiles: { economico: { model: 'a', effort: 'low' }, robusto: { model: 'b', effort: 'high' } } };
test('valida dois perfis sem nomes comerciais fixos', () => {
  assert.deepEqual(parseConfig(valid), valid);
  for (const bad of [null, {}, { ...valid, extra: true }, { ...valid, version: 2 },
    { version: 1, profiles: { ...valid.profiles, robusto: valid.profiles.economico } },
    { version: 1, profiles: { ...valid.profiles, outro: valid.profiles.robusto } },
    { version: 1, profiles: { ...valid.profiles, robusto: { model: '', effort: 'high' } } }])
    assert.throws(() => parseConfig(bad));
});
