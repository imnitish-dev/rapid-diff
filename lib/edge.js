// Cloudflare Workers / Vercel Edge: these runtimes forbid compiling WASM from bytes, so import the module.
import mod from '../wasm/template_pkg_bg.wasm';
import * as w from '../wasm/template_pkg.js';
import { setBinding } from './binding.js';
w.initSync({ module: mod });
setBinding(w);
export * from './api.js';
export const backend = 'wasm';
