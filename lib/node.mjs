// Node / Bun via import: same as node.cjs, but pure ESM (Bun can't require() modules mid-import).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { setBinding } from './binding.js';

const require = createRequire(import.meta.url);
let raw;
let backend = 'native';
try {
  if (process.env.TEMPLATE_PKG_FORCE_WASM) throw new Error('forced');
  raw = require(`../native/template-pkg.${require('./native-name.cjs')()}.node`);
} catch {
  raw = await import('../wasm/template_pkg.js');
  raw.initSync({ module: fs.readFileSync(new URL('../wasm/template_pkg_bg.wasm', import.meta.url)) });
  backend = 'wasm';
}
setBinding(raw);

export * from './api.js';
export { backend };
