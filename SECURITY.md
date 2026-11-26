# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.

Include the input, the options you passed, the output, and the impact. You'll get a reply within 7 days. Confirmed issues are fixed in a patch release and credited to you unless you prefer otherwise.

## Supported versions

Only the latest release gets security fixes.

## How we check

On every push and weekly: `cargo deny` (RustSec advisories, licenses, sources), `npm audit`, CodeQL and secret scanning. Renovate keeps dependencies current and opens security updates immediately.
