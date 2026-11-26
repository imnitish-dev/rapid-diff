// The public API, compatible with jsdiff's diffLines and patch-creation functions.
// Patch formatting is ported from jsdiff's src/patch/create.ts
// (BSD-3-Clause, Copyright (c) 2009-2015 Kevin Decker; see THIRD-PARTY-NOTICES.md).
// Change: context lines are read on demand instead of splitting every unchanged block.
import { raw } from './binding.js';

const IGNORE_WHITESPACE = 1, IGNORE_NEWLINE_AT_EOF = 2, NEWLINE_IS_TOKEN = 4, IGNORE_CASE = 8, ONE_CHANGE_PER_TOKEN = 16;

function lineDiff(oldStr, newStr, options = {}) {
  if (typeof options === 'function') options = { callback: options };
  if (options.comparator) throw new TypeError('rapid-diff: the "comparator" option is not supported (it would call back into JS for every comparison). Use jsdiff for custom comparators.');
  if (options.stripTrailingCr) {
    oldStr = oldStr.replace(/\r\n/g, '\n');
    newStr = newStr.replace(/\r\n/g, '\n');
  }
  const flags = (options.ignoreWhitespace ? IGNORE_WHITESPACE : 0) | (options.ignoreNewlineAtEof ? IGNORE_NEWLINE_AT_EOF : 0)
    | (options.newlineIsToken ? NEWLINE_IS_TOKEN : 0) | (options.ignoreCase ? IGNORE_CASE : 0) | (options.oneChangePerToken ? ONE_CHANGE_PER_TOKEN : 0);
  const packed = raw.diffLinesRaw(String(oldStr), String(newStr), flags, options.maxEditLength ?? undefined, options.timeout ?? undefined);
  let result;
  if (packed != null) {
    result = new Array(packed.length / 4);
    for (let i = 0, j = 0; i < packed.length; i += 4, j++) {
      const kind = packed[i];
      // Same property order as jsdiff, so JSON output is identical too.
      result[j] = { count: packed[i + 1], added: kind === 1, removed: kind === 2, value: (kind === 2 ? oldStr : newStr).slice(packed[i + 2], packed[i + 3]) };
    }
  }
  if (options.callback) {
    setTimeout(() => options.callback(result), 0);
    return undefined;
  }
  return result;
}

/** Line diff, same output as jsdiff's `diffLines`. */
export const diffLines = (oldStr, newStr, options) => lineDiff(oldStr, newStr, options);

/** Line diff ignoring leading and trailing whitespace, same as jsdiff's `diffTrimmedLines`. */
export const diffTrimmedLines = (oldStr, newStr, options) =>
  lineDiff(oldStr, newStr, typeof options === 'function' ? { callback: options, ignoreWhitespace: true } : { ...options, ignoreWhitespace: true });

// ---------- patches ----------

export const INCLUDE_HEADERS = { includeIndex: true, includeUnderline: true, includeFileHeaders: true };
export const FILE_HEADERS_ONLY = { includeIndex: false, includeUnderline: false, includeFileHeaders: true };
export const OMIT_HEADERS = { includeIndex: false, includeUnderline: false, includeFileHeaders: false };

function splitLines(text) {
  const hasTrailingNl = text.endsWith('\n');
  const result = text.split('\n').map((line) => line + '\n');
  if (hasTrailingNl) result.pop();
  else result.push(result.pop().slice(0, -1));
  return result;
}
function firstLines(text, k) {
  const out = [];
  let start = 0;
  while (out.length < k && start < text.length) {
    const i = text.indexOf('\n', start);
    const end = i === -1 ? text.length : i + 1;
    out.push(text.slice(start, end));
    start = end;
  }
  return out;
}
function lastLines(text, k) {
  const out = [];
  let end = text.length;
  while (out.length < k && end > 0) {
    const i = end >= 2 ? text.lastIndexOf('\n', end - 2) : -1;
    out.push(text.slice(i + 1, end));
    end = i + 1;
  }
  return out.reverse();
}

/** Same as jsdiff's `structuredPatch`. */
export function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  let opts = !options ? {} : typeof options === 'function' ? { callback: options } : options;
  if (typeof opts.context === 'undefined') opts = { ...opts, context: 4 };
  const context = opts.context;
  if (opts.newlineIsToken) throw new Error('newlineIsToken may not be used with patch-generation functions, only with diffing functions');

  const toPatch = (diff) => {
    if (!diff) return undefined;
    const sentinel = { value: '', count: 0 };
    diff.push(sentinel);
    const contextLines = (lines) => lines.map((l) => ' ' + l);
    const hunks = [];
    let oldRangeStart = 0, newRangeStart = 0, curRange = [], oldLine = 1, newLine = 1;
    for (let i = 0; i < diff.length; i++) {
      const current = diff[i];
      const len = current.count; // = number of lines: patches never use newlineIsToken
      if (current.added || current.removed) {
        if (!oldRangeStart) {
          const prev = diff[i - 1];
          oldRangeStart = oldLine;
          newRangeStart = newLine;
          if (prev) {
            curRange = context > 0 ? contextLines(lastLines(prev.value, context)) : [];
            oldRangeStart -= curRange.length;
            newRangeStart -= curRange.length;
          }
        }
        const sign = current.added ? '+' : '-';
        for (const line of splitLines(current.value)) curRange.push(sign + line);
        if (current.added) newLine += len;
        else oldLine += len;
      } else {
        if (oldRangeStart) {
          if (len <= context * 2 && i < diff.length - 2) {
            for (const line of contextLines(splitLines(current.value))) curRange.push(line);
          } else {
            const contextSize = Math.min(len, context);
            for (const line of contextLines(firstLines(current.value, contextSize))) curRange.push(line);
            hunks.push({ oldStart: oldRangeStart, oldLines: oldLine - oldRangeStart + contextSize, newStart: newRangeStart, newLines: newLine - newRangeStart + contextSize, lines: curRange });
            oldRangeStart = 0;
            newRangeStart = 0;
            curRange = [];
          }
        }
        oldLine += len;
        newLine += len;
      }
    }
    diff.pop();
    for (const hunk of hunks) {
      for (let i = 0; i < hunk.lines.length; i++) {
        if (hunk.lines[i].endsWith('\n')) hunk.lines[i] = hunk.lines[i].slice(0, -1);
        else { hunk.lines.splice(i + 1, 0, '\\ No newline at end of file'); i++; }
      }
    }
    return { oldFileName, newFileName, oldHeader, newHeader, hunks };
  };

  if (!opts.callback) return toPatch(lineDiff(oldStr, newStr, opts));
  const { callback } = opts;
  lineDiff(oldStr, newStr, { ...opts, callback: (diff) => callback(toPatch(diff)) });
  return undefined;
}

function needsQuoting(s) {
  for (let i = 0; i < s.length; i++) if (s[i] < '\x20' || s[i] > '\x7e' || s[i] === '"' || s[i] === '\\') return true;
  return false;
}
const ESCAPES = { 0x07: '\\a', 0x08: '\\b', 0x09: '\\t', 0x0a: '\\n', 0x0b: '\\v', 0x0c: '\\f', 0x0d: '\\r', 0x22: '\\"', 0x5c: '\\\\' };
function quoteFileNameIfNeeded(s) {
  if (!needsQuoting(s)) return s;
  let result = '"';
  for (const b of new TextEncoder().encode(s)) {
    result += ESCAPES[b] ?? (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '\\' + b.toString(8).padStart(3, '0'));
  }
  return result + '"';
}

/** Same as jsdiff's `formatPatch`: turns a structured patch (or an array of them) into unified diff text. */
export function formatPatch(patch, headerOptions) {
  if (!headerOptions) headerOptions = INCLUDE_HEADERS;
  if (Array.isArray(patch)) {
    if (patch.length > 1 && !headerOptions.includeFileHeaders && !patch.every((p) => p.isGit)) {
      throw new Error('Cannot omit file headers on a multi-file patch. (The result would be unparseable; how would a tool trying to apply the patch know which changes are to which file?)');
    }
    return patch.map((p) => formatPatch(p, headerOptions)).join('\n');
  }
  const ret = [];
  if (patch.isGit) {
    headerOptions = INCLUDE_HEADERS;
    if (!patch.oldFileName) throw new Error('oldFileName must be specified for Git patches');
    if (!patch.newFileName) throw new Error('newFileName must be specified for Git patches');
    let gitOldName = patch.oldFileName;
    let gitNewName = patch.newFileName;
    if (patch.isCreate && gitOldName === '/dev/null') gitOldName = gitNewName.replace(/^b\//, 'a/');
    else if (patch.isDelete && gitNewName === '/dev/null') gitNewName = gitOldName.replace(/^a\//, 'b/');
    ret.push('diff --git ' + quoteFileNameIfNeeded(gitOldName) + ' ' + quoteFileNameIfNeeded(gitNewName));
    if (patch.isDelete) ret.push('deleted file mode ' + (patch.oldMode ?? '100644'));
    if (patch.isCreate) ret.push('new file mode ' + (patch.newMode ?? '100644'));
    if (patch.oldMode && patch.newMode && !patch.isDelete && !patch.isCreate) {
      ret.push('old mode ' + patch.oldMode);
      ret.push('new mode ' + patch.newMode);
    }
    if (patch.isRename) {
      ret.push('rename from ' + quoteFileNameIfNeeded((patch.oldFileName ?? '').replace(/^a\//, '')));
      ret.push('rename to ' + quoteFileNameIfNeeded((patch.newFileName ?? '').replace(/^b\//, '')));
    }
    if (patch.isCopy) {
      ret.push('copy from ' + quoteFileNameIfNeeded((patch.oldFileName ?? '').replace(/^a\//, '')));
      ret.push('copy to ' + quoteFileNameIfNeeded((patch.newFileName ?? '').replace(/^b\//, '')));
    }
  } else {
    if (headerOptions.includeIndex && patch.oldFileName == patch.newFileName && patch.oldFileName !== undefined) ret.push('Index: ' + patch.oldFileName);
    if (headerOptions.includeUnderline) ret.push('===================================================================');
  }
  const hasHunks = patch.hunks.length > 0;
  if (headerOptions.includeFileHeaders && patch.oldFileName !== undefined && patch.newFileName !== undefined && (!patch.isGit || hasHunks)) {
    ret.push('--- ' + quoteFileNameIfNeeded(patch.oldFileName) + (patch.oldHeader ? '\t' + patch.oldHeader : ''));
    ret.push('+++ ' + quoteFileNameIfNeeded(patch.newFileName) + (patch.newHeader ? '\t' + patch.newHeader : ''));
  }
  for (const hunk of patch.hunks) {
    // Unified diff quirk: if a side has 0 lines, its start is one lower than expected.
    const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart;
    const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart;
    ret.push('@@ -' + oldStart + ',' + hunk.oldLines + ' +' + newStart + ',' + hunk.newLines + ' @@');
    for (const line of hunk.lines) ret.push(line);
  }
  return ret.join('\n') + '\n';
}

/** Same as jsdiff's `createTwoFilesPatch`. */
export function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  if (typeof options === 'function') options = { callback: options };
  if (!options?.callback) {
    const patchObj = structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options);
    return patchObj ? formatPatch(patchObj, options?.headerOptions) : undefined;
  }
  const { callback } = options;
  structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, {
    ...options,
    callback: (patchObj) => callback(patchObj ? formatPatch(patchObj, options.headerOptions) : undefined),
  });
  return undefined;
}

/** Same as jsdiff's `createPatch`. */
export const createPatch = (fileName, oldStr, newStr, oldHeader, newHeader, options) =>
  createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);
