// Cloudflare Workers / Vercel Edge: these runtimes forbid compiling WASM from bytes, so import the module.
import mod from '../wasm/rapid_diff_bg.wasm';
import * as w from '../wasm/rapid_diff.js';
import { setBinding } from './binding.js';
w.initSync({ module: mod });
setBinding(w);
export * from './api.js';
export const backend = 'wasm';
