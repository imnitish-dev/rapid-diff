// Internal: holds the loaded engine (native addon or WASM). Set once by the runtime entry.
export let raw;
export const setBinding = (b) => { raw = b; };
