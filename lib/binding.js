// Internal: holds the loaded engine (native addon or WASM). Set once by the runtime entry.
export let raw;

// The WASM engine takes UTF-16 code units (JS's own string format), so Rust never re-encodes text.
const units = (s) => {
  const a = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
};

export const setBinding = (b) => {
  raw = b.diffLinesRaw16 ? { diffLinesRaw: (o, n, ...rest) => b.diffLinesRaw16(units(o), units(n), ...rest) } : b;
};
