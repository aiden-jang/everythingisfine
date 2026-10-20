# Contributing

Use Node.js 22 (22.17 or newer within that major) and the pinned pnpm version. Follow the setup in [README.md](README.md)
and the code guidance in [CONVENTIONS.md](CONVENTIONS.md).

## Changes

Create a branch from current `main`. Keep changes focused and use Conventional Commits without
a scope: `fix: preserve selection after reconnect`, `docs: explain archive coverage`, or
`ci: reduce browser test contention`.

Preserve the keyless browser data flow, original agency readings, visible feed failures,
and browser-local preferences. Put pure decisions in `src/data`, `src/geo`, or `src/app` modules;
keep network adapters in `src/sources` and rendering in `src/globe`.

## Review and verification

Run `pnpm run verify` before opening a pull request. Browser tests use fixtures, and their
local server must be free to bind port 31600. New guards must reject an intentionally introduced
failure; restore the source and confirm the working tree contains only intended changes.
Do not relax assertions, retry counts, timeouts, or budgets to make a check pass.

Describe the problem, resulting behavior, and validation in the pull request. Include desktop
and narrow-screen evidence for visible changes. Update relevant docs and re-read comments at
moved boundaries. Avoid live test counts in documentation.

Protected `main` requires a pull request, passing `check` and `browser-check` statuses, an
up-to-date branch, and resolved conversations. It blocks force pushes and deletion. There is
no mandatory external reviewer for this single-maintainer repository. A merge triggers the
existing deployment.

Report vulnerabilities privately using [SECURITY.md](.github/SECURITY.md). Use the issue templates
for ordinary bugs and product suggestions.
