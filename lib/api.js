// The public API. This is the only JS file a package changes.
// Each function calls the Rust binding (same shape for native and WASM).
import { raw } from './binding.js';

export const greet = (name) => raw.greet(String(name));
