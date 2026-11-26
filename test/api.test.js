import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { greet, backend } from 'template-pkg';

test(`backend is ${backend}`, () => {
  assert.ok(['native', 'wasm'].includes(backend));
  // CI sets this so a missing or broken native binary fails loudly instead of silently using WASM.
  if (process.env.TEMPLATE_PKG_EXPECT) assert.equal(backend, process.env.TEMPLATE_PKG_EXPECT);
});

test('greet', () => assert.equal(greet('you'), 'Hello, you!'));

test('CommonJS require works too', () => {
  assert.equal(createRequire(import.meta.url)('template-pkg').greet('cjs'), 'Hello, cjs!');
});

test('index.d.cts matches index.d.ts', () => {
  assert.equal(fs.readFileSync(new URL('../index.d.cts', import.meta.url), 'utf8'), fs.readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8'));
});
