// Browsers, Deno, anything with fetch + top-level await. Loads the .wasm next to this file.
import init, * as w from '../wasm/template_pkg.js';
import { setBinding } from './binding.js';
await init({ module_or_path: new URL('../wasm/template_pkg_bg.wasm', import.meta.url) });
setBinding(w);
export * from './api.js';
export const backend = 'wasm';
