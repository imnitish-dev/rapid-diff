/** A jsdiff-compatible change object. */
export interface Change {
  count: number;
  added: boolean;
  removed: boolean;
  value: string;
}
export interface DiffLinesOptions {
  /** Ignore leading and trailing whitespace on each line. */
  ignoreWhitespace?: boolean;
  /** Treat a missing newline at the end of the file as equal to one. */
  ignoreNewlineAtEof?: boolean;
  /** Replace `\r\n` with `\n` before diffing. */
  stripTrailingCr?: boolean;
  /** Make newlines separate tokens. */
  newlineIsToken?: boolean;
  /** Compare lines case-insensitively. */
  ignoreCase?: boolean;
  /** Return one change object per line instead of merging consecutive lines. */
  oneChangePerToken?: boolean;
  /** Give up (return `undefined`) if the diff needs more than this many edits. */
  maxEditLength?: number;
  /** Give up (return `undefined`) after this many milliseconds. */
  timeout?: number;
  /** Deliver the result asynchronously instead of returning it. */
  callback?: (result: Change[] | undefined) => void;
}
export interface PatchOptions extends Omit<DiffLinesOptions, 'newlineIsToken' | 'callback'> {
  /** Lines of context around each change. Default 4 (jsdiff's default). */
  context?: number;
  headerOptions?: HeaderOptions;
  callback?: (result: any) => void;
}
export interface HeaderOptions {
  includeIndex: boolean;
  includeUnderline: boolean;
  includeFileHeaders: boolean;
}
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}
export interface StructuredPatch {
  oldFileName: string;
  newFileName: string;
  oldHeader: string | undefined;
  newHeader: string | undefined;
  hunks: Hunk[];
  isGit?: boolean;
  isRename?: boolean;
  isCopy?: boolean;
  isCreate?: boolean;
  isDelete?: boolean;
  oldMode?: string;
  newMode?: string;
}

/** Line diff, same output as jsdiff's `diffLines`. Returns `undefined` if `maxEditLength`/`timeout` is exceeded. */
export function diffLines(oldStr: string, newStr: string, options?: DiffLinesOptions | ((result: Change[] | undefined) => void)): Change[] | undefined;
/** Line diff ignoring leading/trailing whitespace, same as jsdiff's `diffTrimmedLines`. */
export function diffTrimmedLines(oldStr: string, newStr: string, options?: DiffLinesOptions | ((result: Change[] | undefined) => void)): Change[] | undefined;
/** Same as jsdiff's `structuredPatch`. */
export function structuredPatch(oldFileName: string, newFileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: PatchOptions): StructuredPatch | undefined;
/** Same as jsdiff's `formatPatch`. */
export function formatPatch(patch: StructuredPatch | StructuredPatch[], headerOptions?: HeaderOptions): string;
/** Same as jsdiff's `createTwoFilesPatch`: a unified diff. */
export function createTwoFilesPatch(oldFileName: string, newFileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: PatchOptions): string | undefined;
/** Same as jsdiff's `createPatch`. */
export function createPatch(fileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: PatchOptions): string | undefined;
export const INCLUDE_HEADERS: HeaderOptions;
export const FILE_HEADERS_ONLY: HeaderOptions;
export const OMIT_HEADERS: HeaderOptions;
/** Which engine is running: the native addon, or the WASM build. */
export const backend: 'native' | 'wasm';
