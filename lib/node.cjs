'use strict';
// Node / Bun via require(): load the native addon for this platform, fall back to WASM if none is shipped.
const path = require('node:path');
const nativeName = require('./native-name.cjs');

let raw;
let backend = 'native';
try {
  if (process.env.RAPID_DIFF_FORCE_WASM) throw new Error('forced');
  raw = require(path.join(__dirname, `../native/rapid-diff.${nativeName()}.node`));
} catch {
  raw = require('../wasm/rapid_diff.js');
  raw.initSync({ module: require('node:fs').readFileSync(path.join(__dirname, '../wasm/rapid_diff_bg.wasm')) });
  backend = 'wasm';
}
require('./binding.js').setBinding(raw);

module.exports = { ...require('./api.js'), backend };
