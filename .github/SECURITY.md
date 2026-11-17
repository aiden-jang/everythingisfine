# Security policy

Report a suspected vulnerability through
[GitHub private reporting](https://github.com/aiden-jang/everythingisfine/security/advisories/new).
Do not publish exploit details or credentials in an issue or pull request.

Include the affected behavior, reproduction steps, and impact. Redact personal information,
API tokens, and other secrets. The maintained version is the current default branch.

Ordinary bugs and feature requests belong in public issues. This app is an exploration tool;
provider data and approximate eclipse imagery are not emergency alerts or forecasts.

## Patched build dependency

The two installed picomatch versions carry a local mitigation for
[CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), which has no published patched
release. The patches reject repeated extglobs containing an unescaped wildcard in a single branch,
using the parser’s existing risky-pattern fallback. Normal repository glob patterns stay supported.
The exact advisory exception in `package.json` is paired with both lockfile-pinned patches and
`tools/picomatch-security.test.mjs`, which tests the installed Vite and Rollup matchers in bounded
child processes. Remove the exception and patches together when upgrading to an upstream fix.
