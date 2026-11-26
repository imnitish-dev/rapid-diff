#![deny(unsafe_code)] // our code has none; napi macros opt in locally

/// Core logic: plain Rust, shared by the native addon and the WASM build.
pub fn greet(name: &str) -> String {
  format!("Hello, {name}!")
}

// Both bindings expose the same raw API; lib/api.js turns it into the public one.

#[cfg(feature = "napi")]
mod node {
  use napi_derive::napi;

  #[napi]
  pub fn greet(name: String) -> String {
    super::greet(&name)
  }
}

#[cfg(feature = "wasm")]
mod web {
  use wasm_bindgen::prelude::*;

  #[wasm_bindgen]
  pub fn greet(name: &str) -> String {
    super::greet(name)
  }
}

#[cfg(test)]
mod tests {
  #[test]
  fn greet() {
    assert_eq!(super::greet("you"), "Hello, you!");
  }
}
