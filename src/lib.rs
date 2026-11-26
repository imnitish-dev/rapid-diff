#![deny(unsafe_code)] // our code has none; napi macros opt in locally

//! Line diffs that match jsdiff's `diffLines` output exactly: the Myers search below is a
//! faithful port of jsdiff's `base.js` (BSD-3-Clause, Copyright (c) 2009-2015 Kevin Decker),
//! including its tie-breaking, so results are identical, not merely equivalent. The speed comes
//! from interning every line to an integer once and returning offsets instead of strings.

use rustc_hash::FxHashMap as HashMap;
use std::rc::Rc;

pub const IGNORE_WHITESPACE: u32 = 1;
pub const IGNORE_NEWLINE_AT_EOF: u32 = 2;
pub const NEWLINE_IS_TOKEN: u32 = 4;
pub const IGNORE_CASE: u32 = 8;
pub const ONE_CHANGE_PER_TOKEN: u32 = 16;

/// One token: its text plus its position in the original string in UTF-16 units (JS indexes).
struct Token<'a> {
  text: &'a str,
  start16: u32,
  end16: u32,
}

/// jsdiff's line tokenizer: `value.split(/(\n|\r\n)/)`, merged back into "line + separator"
/// tokens (or separate tokens with `newlineIsToken`), empty tokens removed.
fn tokenize(s: &str, newline_is_token: bool) -> Vec<Token<'_>> {
  let mut out = Vec::new();
  let mut pos16 = 0u32;
  let mut rest = s;
  while !rest.is_empty() {
    let (line, sep) = match rest.find('\n') {
      Some(i) => {
        let sep_start = if i > 0 && rest.as_bytes()[i - 1] == b'\r' { i - 1 } else { i };
        (&rest[..sep_start], &rest[sep_start..=i])
      }
      None => (rest, ""),
    };
    // JS positions are UTF-16 units; for ASCII (most code) that's just the byte length.
    let line16 = if line.is_ascii() { line.len() } else { line.encode_utf16().count() } as u32;
    let sep16 = sep.len() as u32; // "\n" or "\r\n": ASCII
    if newline_is_token {
      if !line.is_empty() {
        out.push(Token { text: line, start16: pos16, end16: pos16 + line16 });
      }
      if !sep.is_empty() {
        out.push(Token { text: sep, start16: pos16 + line16, end16: pos16 + line16 + sep16 });
      }
    } else {
      let len = line.len() + sep.len();
      out.push(Token { text: &rest[..len], start16: pos16, end16: pos16 + line16 + sep16 });
    }
    pos16 += line16 + sep16;
    rest = &rest[line.len() + sep.len()..];
  }
  out
}

/// JavaScript's String.prototype.trim() whitespace set (differs from Rust's: +U+FEFF, -U+0085).
fn js_trim(s: &str) -> &str {
  let ws = |c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}';
  s.trim_matches(ws)
}

/// The string two tokens are compared by, after jsdiff's LineDiff.equals transformations.
fn key<'a>(tok: &'a str, flags: u32) -> std::borrow::Cow<'a, str> {
  let mut t = tok;
  if flags & IGNORE_WHITESPACE != 0 {
    if flags & NEWLINE_IS_TOKEN == 0 || !t.contains('\n') {
      t = js_trim(t);
    }
  } else if flags & IGNORE_NEWLINE_AT_EOF != 0 && flags & NEWLINE_IS_TOKEN == 0 {
    t = t.strip_suffix('\n').unwrap_or(t);
  }
  if flags & IGNORE_CASE != 0 {
    std::borrow::Cow::Owned(t.to_lowercase())
  } else {
    std::borrow::Cow::Borrowed(t)
  }
}

fn intern<'a>(toks: &[Token<'a>], flags: u32, ids: &mut HashMap<std::borrow::Cow<'a, str>, u32>) -> Vec<u32> {
  toks
    .iter()
    .map(|t| {
      let next = ids.len() as u32;
      *ids.entry(key(t.text, flags)).or_insert(next)
    })
    .collect()
}

struct Comp {
  count: u32,
  added: bool,
  removed: bool,
  prev: Option<Rc<Comp>>,
}

#[derive(Clone)]
struct Path {
  old_pos: i64,
  last: Option<Rc<Comp>>,
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
pub fn diff_lines(old: &str, new: &str, flags: u32, max_edit_length: Option<f64>, timeout_ms: Option<f64>) -> Option<Vec<u32>> {
  let nl_token = flags & NEWLINE_IS_TOKEN != 0;
  let one_per_token = flags & ONE_CHANGE_PER_TOKEN != 0;
  let old_toks = tokenize(old, nl_token);
  let new_toks = tokenize(new, nl_token);

  // Intern by comparison key: equal lines get equal ids, so the search compares integers.
  let mut ids = HashMap::with_capacity_and_hasher(old_toks.len() + new_toks.len(), Default::default());
  let o = intern(&old_toks, flags, &mut ids);
  let n = intern(&new_toks, flags, &mut ids);
  let (old_len, new_len) = (o.len() as i64, n.len() as i64);

  let extract_common = |base: &mut Path, diagonal: i64| -> i64 {
    let mut old_pos = base.old_pos;
    let mut new_pos = old_pos - diagonal;
    let mut common = 0;
    while new_pos + 1 < new_len && old_pos + 1 < old_len && o[(old_pos + 1) as usize] == n[(new_pos + 1) as usize] {
      new_pos += 1;
      old_pos += 1;
      common += 1;
      if one_per_token {
        base.last = Some(Rc::new(Comp { count: 1, added: false, removed: false, prev: base.last.take() }));
      }
    }
    if common > 0 && !one_per_token {
      base.last = Some(Rc::new(Comp { count: common, added: false, removed: false, prev: base.last.take() }));
    }
    base.old_pos = old_pos;
    new_pos
  };
  let add_to_path = |path: &Path, added: bool, removed: bool, old_inc: i64| -> Path {
    let last = &path.last;
    let comp = match last {
      Some(l) if !one_per_token && l.added == added && l.removed == removed => Comp { count: l.count + 1, added, removed, prev: l.prev.clone() },
      _ => Comp { count: 1, added, removed, prev: last.clone() },
    };
    Path { old_pos: path.old_pos + old_inc, last: Some(Rc::new(comp)) }
  };

  let build = |last: Option<Rc<Comp>>| -> Vec<u32> {
    let mut comps = Vec::new();
    let mut cur = last;
    while let Some(c) = cur {
      comps.push((c.count, c.added, c.removed));
      cur = c.prev.clone();
    }
    comps.reverse();
    let (mut np, mut op) = (0usize, 0usize);
    let mut out = Vec::with_capacity(comps.len() * 4);
    let range = |toks: &[Token<'_>], from: usize, count: usize| match count {
      0 => (0, 0),
      _ => (toks[from].start16, toks[from + count - 1].end16),
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

  let mut first = Path { old_pos: -1, last: None };
  let new_pos = extract_common(&mut first, 0);
  if first.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
    return Some(build(first.last));
  }
  best[offset as usize] = Some(first);

  let (mut min_diag, mut max_diag) = (i64::MIN, i64::MAX);
  let mut edit_len: i64 = 1;
  while edit_len <= max_edit && deadline.is_none_or(|d| now_ms() <= d) {
    let mut diag = min_diag.max(-edit_len);
    while diag <= max_diag.min(edit_len) {
      let remove_path = best[(diag - 1 + offset) as usize].take(); // nobody else will use it
      let add_path = best[(diag + 1 + offset) as usize].clone();
      let can_add = add_path.as_ref().is_some_and(|p| {
        let add_new_pos = p.old_pos - diag;
        0 <= add_new_pos && add_new_pos < new_len
      });
      let can_remove = remove_path.as_ref().is_some_and(|p| p.old_pos + 1 < old_len);
      if !can_add && !can_remove {
        best[(diag + offset) as usize] = None;
        diag += 2;
        continue;
      }
      let mut base = if !can_remove || (can_add && remove_path.as_ref().unwrap().old_pos < add_path.as_ref().unwrap().old_pos) {
        add_to_path(add_path.as_ref().unwrap(), true, false, 0)
      } else {
        add_to_path(remove_path.as_ref().unwrap(), false, true, 1)
      };
      let new_pos = extract_common(&mut base, diag);
      if base.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
        return Some(build(base.last));
      }
      if base.old_pos + 1 >= old_len {
        max_diag = max_diag.min(diag - 1);
      }
      if new_pos + 1 >= new_len {
        min_diag = min_diag.max(diag + 1);
      }
      best[(diag + offset) as usize] = Some(base);
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
  pub fn diff_lines_raw(old: String, new: String, flags: u32, max_edit_length: Option<f64>, timeout: Option<f64>) -> Option<Vec<u32>> {
    super::diff_lines(&old, &new, flags, max_edit_length, timeout)
  }
}

#[cfg(feature = "wasm")]
mod web {
  use wasm_bindgen::prelude::*;

  #[wasm_bindgen(js_name = diffLinesRaw)]
  pub fn diff_lines_raw(old: &str, new: &str, flags: u32, max_edit_length: Option<f64>, timeout: Option<f64>) -> Option<Vec<u32>> {
    super::diff_lines(old, new, flags, max_edit_length, timeout)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn values(old: &str, new: &str, flags: u32) -> Vec<(u32, String)> {
    let enc = |s: &str| s.encode_utf16().collect::<Vec<_>>();
    let (o16, n16) = (enc(old), enc(new));
    diff_lines(old, new, flags, None, None)
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
    assert_eq!(diff_lines("a\nb\nc\n", "x\ny\nz\n", 0, Some(1.0), None), None);
  }

  #[test]
  fn tokenizer_matches_js_split() {
    let toks = |s: &str, nl| tokenize(s, nl).iter().map(|t| t.text.to_string()).collect::<Vec<_>>();
    assert_eq!(toks("a\n\nb", false), ["a\n", "\n", "b"]);
    assert_eq!(toks("\nx\r\ny\r", false), ["\n", "x\r\n", "y\r"]);
    assert_eq!(toks("a\r\n\nb", true), ["a", "\r\n", "\n", "b"]);
  }
}

