import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { diffLines, backend } from 'rapid-diff';

test(`backend is ${backend}`, () => {
  assert.ok(['native', 'wasm'].includes(backend));
  // CI sets this so a missing or broken native binary fails loudly instead of silently using WASM.
  if (process.env.RAPID_DIFF_EXPECT) assert.equal(backend, process.env.RAPID_DIFF_EXPECT);
});

test('CommonJS require works too', () => {
  const cjs = createRequire(import.meta.url)('rapid-diff');
  assert.equal(cjs.diffLines('a\n', 'b\n').length, 2);
  assert.equal(diffLines('a\n', 'a\n').length, 1);
});

test('index.d.cts matches index.d.ts', () => {
  assert.equal(fs.readFileSync(new URL('../index.d.cts', import.meta.url), 'utf8'), fs.readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8'));
});
