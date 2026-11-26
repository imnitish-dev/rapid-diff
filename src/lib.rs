#![deny(unsafe_code)] // our code has none; napi macros opt in locally

//! Line diffs that match jsdiff's `diffLines` output exactly: the Myers search below is a
//! faithful port of jsdiff's `base.js` (BSD-3-Clause, Copyright (c) 2009-2015 Kevin Decker),
//! including its tie-breaking, so results are identical, not merely equivalent. The speed comes
//! from reading JS strings as raw UTF-16 (no re-encoding), interning every line to an integer
//! once, and returning offsets instead of strings.

use rustc_hash::FxHashMap as HashMap;
use std::borrow::Cow;

pub const IGNORE_WHITESPACE: u32 = 1;
pub const IGNORE_NEWLINE_AT_EOF: u32 = 2;
pub const NEWLINE_IS_TOKEN: u32 = 4;
pub const IGNORE_CASE: u32 = 8;
pub const ONE_CHANGE_PER_TOKEN: u32 = 16;

/// One token as a range of UTF-16 units, which are also the JS string indexes.
#[derive(Clone, Copy)]
struct Token {
  start: u32,
  end: u32,
}

/// jsdiff's line tokenizer: `value.split(/(\n|\r\n)/)`, merged back into "line + separator"
/// tokens (or separate tokens with `newlineIsToken`), empty tokens removed.
fn tokenize(s: &[u16], newline_is_token: bool) -> Vec<Token> {
  let mut out = Vec::new();
  let mut pos = 0usize;
  while pos < s.len() {
    let (line_end, end) = match s[pos..].iter().position(|&c| c == b'\n' as u16) {
      Some(i) => (pos + if i > 0 && s[pos + i - 1] == b'\r' as u16 { i - 1 } else { i }, pos + i + 1),
      None => (s.len(), s.len()),
    };
    if newline_is_token {
      if line_end > pos {
        out.push(Token { start: pos as u32, end: line_end as u32 });
      }
      if end > line_end {
        out.push(Token { start: line_end as u32, end: end as u32 });
      }
    } else {
      out.push(Token { start: pos as u32, end: end as u32 });
    }
    pos = end;
  }
  out
}

/// JavaScript's String.prototype.trim() whitespace set (all in the BMP, so one UTF-16 unit each).
fn is_js_ws(c: u16) -> bool {
  matches!(c, 0x09..=0x0d | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}
fn js_trim(s: &[u16]) -> &[u16] {
  let start = s.iter().position(|&c| !is_js_ws(c)).unwrap_or(s.len());
  let end = s.iter().rposition(|&c| !is_js_ws(c)).map_or(start, |i| i + 1);
  &s[start..end]
}

/// The units two tokens are compared by, after jsdiff's LineDiff.equals transformations.
fn key(tok: &[u16], flags: u32) -> Cow<'_, [u16]> {
  let mut t = tok;
  if flags & IGNORE_WHITESPACE != 0 {
    if flags & NEWLINE_IS_TOKEN == 0 || !t.contains(&(b'\n' as u16)) {
      t = js_trim(t);
    }
  } else if flags & IGNORE_NEWLINE_AT_EOF != 0 && flags & NEWLINE_IS_TOKEN == 0 {
    t = t.strip_suffix(&[b'\n' as u16]).unwrap_or(t);
  }
  if flags & IGNORE_CASE != 0 {
    Cow::Owned(String::from_utf16_lossy(t).to_lowercase().encode_utf16().collect())
  } else {
    Cow::Borrowed(t)
  }
}

fn intern<'a>(s: &'a [u16], toks: &[Token], flags: u32, ids: &mut HashMap<Cow<'a, [u16]>, u32>) -> Vec<u32> {
  toks
    .iter()
    .map(|t| {
      let next = ids.len() as u32;
      *ids.entry(key(&s[t.start as usize..t.end as usize], flags)).or_insert(next)
    })
    .collect()
}

const NONE: u32 = u32::MAX;

/// A change object in jsdiff's linked list of components.
struct Comp {
  count: u32,
  added: bool,
  removed: bool,
  prev: u32,
  refs: u32,
}

/// Reference-counted components in one Vec with a free list: the same memory behaviour as
/// jsdiff's garbage-collected objects (dead branches are reused), without a malloc per step.
#[derive(Default)]
struct Arena {
  comps: Vec<Comp>,
  free: Vec<u32>,
}

impl Arena {
  /// New component holding one reference; takes over the caller's reference to `prev`.
  fn alloc(&mut self, count: u32, added: bool, removed: bool, prev: u32) -> u32 {
    let c = Comp { count, added, removed, prev, refs: 1 };
    match self.free.pop() {
      Some(i) => {
        self.comps[i as usize] = c;
        i
      }
      None => {
        self.comps.push(c);
        (self.comps.len() - 1) as u32
      }
    }
  }
  fn retain(&mut self, i: u32) -> u32 {
    if i != NONE {
      self.comps[i as usize].refs += 1;
    }
    i
  }
  fn release(&mut self, mut i: u32) {
    while i != NONE {
      let c = &mut self.comps[i as usize];
      c.refs -= 1;
      if c.refs > 0 {
        return;
      }
      self.free.push(i);
      i = c.prev;
    }
  }
}

#[derive(Clone, Copy)]
struct Path {
  old_pos: i64,
  last: u32,
}

/// Wall clock in ms, for jsdiff's `timeout` option.
#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}
#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 {
  #[wasm_bindgen::prelude::wasm_bindgen]
  extern "C" {
    #[wasm_bindgen(js_namespace = Date, js_name = now)]
    fn date_now() -> f64;
  }
  date_now()
}

/// Diff two strings by lines. Returns `[kind, count, start16, end16]` per change object
/// (kind 0 = common, 1 = added, 2 = removed; offsets index the new string for kinds 0/1 and the
/// old string for kind 2), or `None` when `maxEditLength`/`timeout` is exceeded (jsdiff: undefined).
pub fn diff_lines(old: &[u16], new: &[u16], flags: u32, max_edit_length: Option<f64>, timeout_ms: Option<f64>) -> Option<Vec<u32>> {
  let nl_token = flags & NEWLINE_IS_TOKEN != 0;
  let one_per_token = flags & ONE_CHANGE_PER_TOKEN != 0;
  let old_toks = tokenize(old, nl_token);
  let new_toks = tokenize(new, nl_token);

  // Intern by comparison key: equal lines get equal ids, so the search compares integers.
  let mut ids = HashMap::with_capacity_and_hasher(old_toks.len() + new_toks.len(), Default::default());
  let o = intern(old, &old_toks, flags, &mut ids);
  let n = intern(new, &new_toks, flags, &mut ids);
  let (old_len, new_len) = (o.len() as i64, n.len() as i64);

  let mut arena = Arena::default();
  let extract_common = |arena: &mut Arena, base: &mut Path, diagonal: i64| -> i64 {
    let mut old_pos = base.old_pos;
    let mut new_pos = old_pos - diagonal;
    let mut common = 0;
    while new_pos + 1 < new_len && old_pos + 1 < old_len && o[(old_pos + 1) as usize] == n[(new_pos + 1) as usize] {
      new_pos += 1;
      old_pos += 1;
      common += 1;
      if one_per_token {
        base.last = arena.alloc(1, false, false, base.last);
      }
    }
    if common > 0 && !one_per_token {
      base.last = arena.alloc(common, false, false, base.last);
    }
    base.old_pos = old_pos;
    new_pos
  };
  let add_to_path = |arena: &mut Arena, path: Path, added: bool, removed: bool, old_inc: i64| -> Path {
    let l = path.last;
    let last = if l != NONE && !one_per_token && arena.comps[l as usize].added == added && arena.comps[l as usize].removed == removed {
      let (count, prev) = (arena.comps[l as usize].count, arena.comps[l as usize].prev);
      let prev = arena.retain(prev);
      arena.alloc(count + 1, added, removed, prev)
    } else {
      let prev = arena.retain(l);
      arena.alloc(1, added, removed, prev)
    };
    Path { old_pos: path.old_pos + old_inc, last }
  };

  let build = |arena: &Arena, last: u32| -> Vec<u32> {
    let mut comps = Vec::new();
    let mut cur = last;
    while cur != NONE {
      let c = &arena.comps[cur as usize];
      comps.push((c.count, c.added, c.removed));
      cur = c.prev;
    }
    comps.reverse();
    let (mut np, mut op) = (0usize, 0usize);
    let mut out = Vec::with_capacity(comps.len() * 4);
    let range = |toks: &[Token], from: usize, count: usize| match count {
      0 => (0, 0),
      _ => (toks[from].start, toks[from + count - 1].end),
    };
    for (count, added, removed) in comps {
      let c = count as usize;
      let (kind, (s, e)) = if removed {
        let r = range(&old_toks, op, c);
        op += c;
        (2, r)
      } else {
        let r = range(&new_toks, np, c);
        np += c;
        if !added {
          op += c;
        }
        (if added { 1 } else { 0 }, r)
      };
      out.extend([kind, count, s, e]);
    }
    out
  };

  let max_edit = max_edit_length.map_or(new_len + old_len, |m| (m as i64).min(new_len + old_len));
  let deadline = timeout_ms.map(|t| now_ms() + t);
  let size = (2 * (new_len + old_len) + 3) as usize;
  let offset = new_len + old_len + 1; // diagonal d lives at index d + offset
  let mut best: Vec<Option<Path>> = vec![None; size];

  let mut first = Path { old_pos: -1, last: NONE };
  let new_pos = extract_common(&mut arena, &mut first, 0);
  if first.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
    return Some(build(&arena, first.last));
  }
  best[offset as usize] = Some(first);

  let (mut min_diag, mut max_diag) = (i64::MIN, i64::MAX);
  let mut edit_len: i64 = 1;
  while edit_len <= max_edit && deadline.is_none_or(|d| now_ms() <= d) {
    let mut diag = min_diag.max(-edit_len);
    while diag <= max_diag.min(edit_len) {
      let remove_path = best[(diag - 1 + offset) as usize].take(); // nobody else will use it
      let add_path = best[(diag + 1 + offset) as usize]; // borrowed: stays in `best`
      let can_add = add_path.as_ref().is_some_and(|p| {
        let add_new_pos = p.old_pos - diag;
        0 <= add_new_pos && add_new_pos < new_len
      });
      let can_remove = remove_path.as_ref().is_some_and(|p| p.old_pos + 1 < old_len);
      if !can_add && !can_remove {
        if let Some(p) = best[(diag + offset) as usize].take() {
          arena.release(p.last);
        }
        if let Some(p) = remove_path {
          arena.release(p.last);
        }
        diag += 2;
        continue;
      }
      let mut base = if !can_remove || (can_add && remove_path.unwrap().old_pos < add_path.unwrap().old_pos) {
        add_to_path(&mut arena, add_path.unwrap(), true, false, 0)
      } else {
        add_to_path(&mut arena, remove_path.unwrap(), false, true, 1)
      };
      if let Some(p) = remove_path {
        arena.release(p.last);
      }
      let new_pos = extract_common(&mut arena, &mut base, diag);
      if base.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
        return Some(build(&arena, base.last));
      }
      if base.old_pos + 1 >= old_len {
        max_diag = max_diag.min(diag - 1);
      }
      if new_pos + 1 >= new_len {
        min_diag = min_diag.max(diag + 1);
      }
      if let Some(p) = best[(diag + offset) as usize].replace(base) {
        arena.release(p.last);
      }
      diag += 2;
    }
    edit_len += 1;
  }
  None
}

#[cfg(feature = "napi")]
mod node {
  use napi_derive::napi;

  #[napi]
  pub fn diff_lines_raw(old: napi::bindgen_prelude::Utf16String, new: napi::bindgen_prelude::Utf16String, flags: u32, max_edit_length: Option<f64>, timeout: Option<f64>) -> Option<Vec<u32>> {
    super::diff_lines(&old, &new, flags, max_edit_length, timeout)
  }
}

#[cfg(feature = "wasm")]
mod web {
  use wasm_bindgen::prelude::*;

  /// Takes UTF-16 code units; lib/binding.js converts the strings.
  #[wasm_bindgen(js_name = diffLinesRaw16)]
  pub fn diff_lines_raw16(old: &[u16], new: &[u16], flags: u32, max_edit_length: Option<f64>, timeout: Option<f64>) -> Option<Vec<u32>> {
    super::diff_lines(old, new, flags, max_edit_length, timeout)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn values(old: &str, new: &str, flags: u32) -> Vec<(u32, String)> {
    let enc = |s: &str| s.encode_utf16().collect::<Vec<_>>();
    let (o16, n16) = (enc(old), enc(new));
    diff_lines(&o16, &n16, flags, None, None)
      .unwrap()
      .chunks(4)
      .map(|c| {
        let src = if c[0] == 2 { &o16 } else { &n16 };
        (c[0], String::from_utf16(&src[c[2] as usize..c[3] as usize]).unwrap())
      })
      .collect()
  }

  #[test]
  fn matches_jsdiff_examples() {
    // Expected values captured from jsdiff 9.0.0.
    assert_eq!(values("a\nb\nc\n", "a\nB\nc\nd\n", 0), vec![(0, "a\n".into()), (2, "b\n".into()), (1, "B\n".into()), (0, "c\n".into()), (1, "d\n".into())]);
    assert_eq!(values("a\nb", "a\nb\n", 0), vec![(0, "a\n".into()), (2, "b".into()), (1, "b\n".into())]);
    assert_eq!(values("same\n", "same\n", 0), vec![(0, "same\n".into())]);
    assert_eq!(values("", "", 0), vec![]);
  }

  #[test]
  fn crlf_unicode_offsets() {
    assert_eq!(values("x\r\n😀é\r\n", "x\r\n😀É\r\n", 0), vec![(0, "x\r\n".into()), (2, "😀é\r\n".into()), (1, "😀É\r\n".into())]);
    assert_eq!(values("😀é\n", "😀É\n", IGNORE_CASE), vec![(0, "😀É\n".into())]);
  }

  #[test]
  fn options() {
    assert_eq!(values("  a  \n", "a\n", IGNORE_WHITESPACE), vec![(0, "a\n".into())]);
    assert_eq!(values("\u{feff}a\n", "a\n", IGNORE_WHITESPACE), vec![(0, "a\n".into())]); // JS trim strips BOM
    assert_eq!(values("a", "a\n", IGNORE_NEWLINE_AT_EOF), vec![(0, "a\n".into())]);
    assert_eq!(values("a\nb\n", "a\nb\n", NEWLINE_IS_TOKEN).len(), 1);
    let enc = |s: &str| s.encode_utf16().collect::<Vec<u16>>();
    assert_eq!(diff_lines(&enc("a\nb\nc\n"), &enc("x\ny\nz\n"), 0, Some(1.0), None), None);
  }

  #[test]
  fn tokenizer_matches_js_split() {
    let toks = |s: &str, nl| {
      let u: Vec<u16> = s.encode_utf16().collect();
      tokenize(&u, nl).iter().map(|t| String::from_utf16(&u[t.start as usize..t.end as usize]).unwrap()).collect::<Vec<_>>()
    };
    assert_eq!(toks("a\n\nb", false), ["a\n", "\n", "b"]);
    assert_eq!(toks("\nx\r\ny\r", false), ["\n", "x\r\n", "y\r"]);
    assert_eq!(toks("a\r\n\nb", true), ["a", "\r\n", "\n", "b"]);
  }
}

