# template-pkg

[![npm](https://img.shields.io/npm/v/template-pkg)](https://www.npmjs.com/package/template-pkg)
[![CI](https://github.com/imnitish-dev/template-pkg/actions/workflows/ci.yml/badge.svg)](https://github.com/imnitish-dev/template-pkg/actions/workflows/ci.yml)
[![runtime deps: 0](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](package.json)
[![license: MIT](https://img.shields.io/npm/l/template-pkg)](LICENSE)

> TEMPLATE_DESCRIPTION

- **Plug and play.** Install, import, done. No `init()`, no bundler plugin, no config.
- **Fast.** Rust core. See [benchmarks](#benchmarks).
- **TypeScript included.** Types are checked in CI for ESM, CommonJS and bundler setups.
- **Runs everywhere.** Native addon in Node and Bun, WebAssembly in browsers, Deno and edge runtimes. The right one is picked automatically.

## Install

```sh
npm install template-pkg
yarn add template-pkg
pnpm add template-pkg
bun add template-pkg
```

## Usage

```js
import { greet } from 'template-pkg';

greet('you'); //=> 'Hello, you!'
```

CommonJS works too: `const { greet } = require('template-pkg')`.

## API

### `greet(name)`

TODO: document every function, every option, and what it throws.

### `backend`

`'native'` or `'wasm'`: which engine is running.

## Runtimes

Prebuilt native addons, each tested on its real platform in CI: macOS (Apple Silicon), Linux x64 and ARM64 (glibc), Alpine Linux (musl), Windows x64. Anything else falls back to WebAssembly automatically.

| Runtime | Engine | Verified |
|---|---|---|
| Node.js 20, 22, 24 (ESM and CommonJS) | native addon | ✅ CI on macOS, Linux, Alpine, Windows |
| Node.js without a matching prebuilt addon | WebAssembly (automatic fallback) | ✅ CI |
| Bun | native addon | ✅ CI |
| Browsers, Deno, Cloudflare Workers | WebAssembly | ⏳ verify before claiming |

## Benchmarks

TODO: real inputs, against the libraries people use today. `cd bench && npm install && node bench.js`.

## Security and maintenance

**Vulnerability scanning**, on every push and every Monday: [`cargo deny`](deny.toml) (RustSec advisories, licenses, sources), `npm audit`, GitHub CodeQL, secret scanning, Dependabot alerts.

**Dependency updates** with [Renovate](renovate.json): updates wait 3 days after release (a guard against hijacked versions), minor and patch updates merge only after the full CI passes, security fixes are opened immediately.

**Supply chain:** zero runtime dependencies; every release is the tarball CI built and tested on all platforms; third-party notices for the bundled Rust code ship in the package as `THIRD-PARTY-LICENSES.md`.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## For AI coding agents

TODO: one paragraph on when to use this package instead of writing the code or adding another dependency.

## License

MIT
