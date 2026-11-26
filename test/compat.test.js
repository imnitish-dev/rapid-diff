// Differential test: rapid-diff must produce byte-identical output to jsdiff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as jsdiff from 'diff';
import * as ours from 'rapid-diff';

let seed = 1234;
const rand = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
const pick = (a) => a[rand(a.length)];
const WORDS = ['alpha', 'beta', '  indented', 'Beta', 'BETA', '', ' ', '\t', 'x', 'y', 'z', '😀 emoji', 'é', '{', '}', 'return 1;', 'return 2;'];

function randomText() {
  const lines = Array.from({ length: rand(30) }, () => pick(WORDS) + (rand(5) === 0 ? ' ' : ''));
  const eol = rand(4) === 0 ? '\r\n' : '\n';
  let s = lines.join(eol);
  if (rand(3)) s += eol; // sometimes no newline at end of file
  return s;
}
function edit(s) {
  const lines = s.split('\n');
  for (let k = rand(6); k > 0; k--) {
    const i = rand(lines.length + 1);
    const op = rand(4);
    if (op === 0) lines.splice(i, 1);
    else if (op === 1) lines.splice(i, 0, pick(WORDS));
    else if (op === 2 && lines[i] !== undefined) lines[i] = lines[i].toUpperCase();
    else if (lines[i] !== undefined) lines[i] = '  ' + lines[i] + ' ';
  }
  return rand(5) === 0 ? lines.join('\n').replace(/\n$/, '') : lines.join('\n');
}

const OPTION_SETS = [
  {}, { ignoreWhitespace: true }, { ignoreNewlineAtEof: true }, { stripTrailingCr: true }, { newlineIsToken: true },
  { ignoreCase: true }, { oneChangePerToken: true }, { ignoreWhitespace: true, newlineIsToken: true },
  { ignoreCase: true, ignoreWhitespace: true, stripTrailingCr: true }, { maxEditLength: 3 },
];

test('diffLines output is identical to jsdiff (3,000 random cases x 10 option sets)', () => {
  let compared = 0;
  for (let i = 0; i < 3000; i++) {
    const a = randomText();
    const b = rand(4) === 0 ? randomText() : edit(a);
    for (const opts of OPTION_SETS) {
      const expected = JSON.stringify(jsdiff.diffLines(a, b, opts));
      const actual = JSON.stringify(ours.diffLines(a, b, opts));
      if (actual !== expected) assert.fail(`mismatch\nopts=${JSON.stringify(opts)}\na=${JSON.stringify(a)}\nb=${JSON.stringify(b)}\nexpected=${expected}\nactual=  ${actual}`);
      compared++;
    }
  }
  assert.equal(compared, 30000);
});

test('diffTrimmedLines is identical to jsdiff', () => {
  for (let i = 0; i < 500; i++) {
    const a = randomText(), b = edit(a);
    assert.equal(JSON.stringify(ours.diffTrimmedLines(a, b)), JSON.stringify(jsdiff.diffTrimmedLines(a, b)));
  }
});

test('createTwoFilesPatch / createPatch / structuredPatch are identical to jsdiff', () => {
  const PATCH_OPTS = [undefined, { context: 0 }, { context: 1 }, { context: 10 }, { ignoreWhitespace: true }, { stripTrailingCr: true },
    { headerOptions: jsdiff.OMIT_HEADERS }, { headerOptions: jsdiff.FILE_HEADERS_ONLY }, { maxEditLength: 2 }];
  for (let i = 0; i < 2000; i++) {
    const a = randomText();
    const b = rand(4) === 0 ? randomText() : edit(a);
    for (const opts of PATCH_OPTS) {
      const names = rand(8) === 0 ? ['dir/old "quoted".txt', 'dir/nëw\tfile'] : ['old.txt', 'new.txt'];
      const newHeader = rand(2) ? undefined : 'h2';
      const expected = jsdiff.createTwoFilesPatch(names[0], names[1], a, b, 'h1', newHeader, opts);
      const actual = ours.createTwoFilesPatch(names[0], names[1], a, b, 'h1', newHeader, opts);
      assert.equal(actual, expected, `opts=${JSON.stringify(opts)} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
      assert.equal(ours.createPatch('f.txt', a, b, undefined, undefined, opts), jsdiff.createPatch('f.txt', a, b, undefined, undefined, opts));
      assert.equal(JSON.stringify(ours.structuredPatch('o', 'n', a, b, 'x', 'y', opts)), JSON.stringify(jsdiff.structuredPatch('o', 'n', a, b, 'x', 'y', opts)));
    }
  }
});

test('callback mode is asynchronous and matches', async () => {
  const a = 'a\nb\nc\n', b = 'a\nB\nc\n';
  const viaCallback = await new Promise((resolve) => assert.equal(ours.diffLines(a, b, { callback: resolve }), undefined));
  assert.deepEqual(viaCallback, jsdiff.diffLines(a, b));
  const patch = await new Promise((resolve) => ours.createTwoFilesPatch('o', 'n', a, b, '', '', { callback: resolve }));
  assert.equal(patch, jsdiff.createTwoFilesPatch('o', 'n', a, b, '', ''));
});

test('a large real-world file', () => {
  const a = Array.from({ length: 20000 }, (_, i) => `line ${i % 997} ${'x'.repeat(i % 40)}`).join('\n') + '\n';
  const lines = a.split('\n');
  for (let i = 0; i < lines.length; i += 53) lines[i] = lines[i] + ' // edited';
  lines.splice(5000, 30);
  lines.splice(12000, 0, ...lines.slice(100, 140));
  const b = lines.join('\n');
  assert.equal(JSON.stringify(ours.diffLines(a, b)), JSON.stringify(jsdiff.diffLines(a, b)));
  assert.equal(ours.createTwoFilesPatch('a', 'b', a, b), jsdiff.createTwoFilesPatch('a', 'b', a, b));
});

test('comparator is refused with a clear message', () => {
  assert.throws(() => ours.diffLines('a', 'b', { comparator: () => true }), /comparator/);
});
