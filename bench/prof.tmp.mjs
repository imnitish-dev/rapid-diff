import fs from 'node:fs';
import * as rapid from 'rapid-diff';
import { raw as b } from '../lib/binding.js';
const src = fs.readFileSync(new URL('../node_modules/diff/dist/diff.js', import.meta.url), 'utf8');
function editLines(text, every) { const lines = text.split('\n'); for (let i = 7; i < lines.length; i += every) lines[i] = lines[i].replace(/var /g, 'let ') + ' // edited'; lines.splice(Math.floor(lines.length / 3), 40); lines.splice(Math.floor(lines.length / 2), 0, ...lines.slice(100, 160)); return lines.join('\n'); }
const big = src.repeat(Math.ceil(360_000 / src.length)), big2 = editLines(big, 50);
const t = (f, n = 40) => { for (let i = 0; i < 5; i++) f(); const a = []; for (let i = 0; i < n; i++) { const s = performance.now(); f(); a.push(performance.now() - s); } a.sort((x, y) => x - y); return a[n >> 1].toFixed(3) + ' ms'; };
console.log('full diffLines        ', t(() => rapid.diffLines(big, big2)));
console.log('raw only              ', t(() => b.diffLinesRaw(big, big2, 0)));
console.log('raw identical         ', t(() => b.diffLinesRaw(big, big, 0)));
console.log('raw empty vs big      ', t(() => b.diffLinesRaw('', big, 0)));
console.log('raw tiny x1000        ', t(() => { for (let i = 0; i < 1000; i++) b.diffLinesRaw('a\n', 'b\n', 0); }));
const r = b.diffLinesRaw(big, big2, 0); console.log('changes', r.length / 4, 'lines', big.split('\n').length);
