// Run: npm run build && cd bench && npm install && node bench.js
// Public API on both sides (includes JS<->native transfer and building change objects). Median of 5.
import * as jsdiff from 'diff';
import * as rapid from 'rapid-diff';

const raw = (await import('node:fs')).readFileSync(new URL('../node_modules/diff/dist/diff.js', import.meta.url), 'utf8');
function editLines(text, every) {
  const lines = text.split('\n');
  for (let i = 7; i < lines.length; i += every) lines[i] = lines[i].replace(/var /g, 'let ') + ' // edited';
  lines.splice(Math.floor(lines.length / 3), 40);
  lines.splice(Math.floor(lines.length / 2), 0, ...lines.slice(100, 160));
  return lines.join('\n');
}
const big = raw.repeat(Math.ceil(360_000 / raw.length));
const medium = raw.slice(0, 20_000);
const small = Array.from({ length: 1000 }, (_, i) => [raw.slice(i * 50, i * 50 + 2000), editLines(raw.slice(i * 50, i * 50 + 2000), 9)]);
const rand = (n, s) => Array.from({ length: n }, (_, i) => `${s} ${i * 7919 % 10007}`).join('\n');

const cases = [
  ['Large file, small edit (360 KB, ~2% of lines)', () => [big, editLines(big, 50)], 'both'],
  ['Typical source file (20 KB, a few edits)', () => [medium, editLines(medium, 40)], 'both'],
  ['1,000 small diffs (2 KB each)', null, 'many'],
  ['Completely different files (2,000 lines each)', () => [rand(2000, 'a'), rand(2000, 'b')], 'both'],
];
function time(fn, runs = 5) {
  fn();
  const t = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)];
}
const fmt = (ms) => (ms < 10 ? ms.toFixed(2) : ms.toFixed(0)) + ' ms';

console.log(`| Scenario | Function | jsdiff | rapid-diff (${rapid.backend}) | Speedup |\n|---|---|---|---|---|`);
const results = [];
for (const [name, make, kind] of cases) {
  const fns = kind === 'many'
    ? [['diffLines', (lib) => { for (const [a, b] of small) lib.diffLines(a, b); }], ['createTwoFilesPatch', (lib) => { for (const [a, b] of small) lib.createTwoFilesPatch('a', 'b', a, b); }]]
    : (() => { const [a, b] = make(); return [['diffLines', (lib) => lib.diffLines(a, b)], ['createTwoFilesPatch', (lib) => lib.createTwoFilesPatch('a', 'b', a, b)]]; })();
  for (const [fn, run] of fns) {
    const j = time(() => run(jsdiff)), r = time(() => run(rapid));
    results.push({ name, fn, jsdiff: j, rapid: r });
    console.log(`| ${name} | \`${fn}\` | ${fmt(j)} | **${fmt(r)}** | **${(j / r).toFixed(1)}×** |`);
  }
}
console.log(`\nNode ${process.version}, ${(await import('node:os')).cpus()[0].model}`);
(await import('node:fs')).writeFileSync(new URL(`results-${rapid.backend}.json`, import.meta.url), JSON.stringify(results, null, 2));
