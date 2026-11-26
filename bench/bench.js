// Run: npm run build && cd bench && npm install && node bench.js
// Compare against the libraries people actually use, on real inputs. Report ms per call.
import { greet } from 'template-pkg';

export function bench(fn, input, ms = 1500) {
  for (let i = 0; i < 5; i++) fn(input); // warm up
  let n = 0;
  const start = performance.now();
  while (performance.now() - start < ms) { fn(input); n++; }
  return (performance.now() - start) / n;
}

const rows = { 'template-pkg': (s) => greet(s), 'plain JS': (s) => `Hello, ${s}!` };
console.log('| Library | ms per call |\n|---|---|');
for (const [lib, fn] of Object.entries(rows)) console.log(`| ${lib} | ${bench(fn, 'you').toFixed(5)} |`);
