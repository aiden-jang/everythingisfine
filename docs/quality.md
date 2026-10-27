# Quality checks

Run `pnpm run verify` with the runtime selected by `.nvmrc`. The core checks cover dependency
advisories, repository/documentation rules, CSS, types, lint, formatting, deterministic source tests,
memory/performance budgets and the production build. Browser verification then reuses that local build.
Standalone `pnpm run test:e2e` builds before starting its release server.

## Browser boundaries

- The release project uses port 31600 and the ordinary production bundle.
- The development project uses port 31601 for tests tagged `@dev` that inspect camera/store state.
- Each test belongs to one project. The normal suite retains every journey without a second copy
  of the whole suite or production skips. `pnpm run test:e2e:build` deliberately selects release only.
- Both servers belong to the test run. An occupied port fails instead of reusing an unknown preview.
- Recorded feeds replace the external agency calls and EMSC socket. These tests do not establish
  current provider availability; `pnpm run test:live` is an explicit, separate check.

One software-rendered globe runs per runner. CI distributes the complete inventory across isolated
shards. It keeps core checks and browser runners parallel, then deploys the assets from the successful
core build only after every shard passes. Failure traces and screenshots remain available.

Accessibility journeys scan live and pinned states at phone and desktop widths with axe.
They check landmark structure, visible-label matching and the applicable automated accessibility rules.
These cases share the existing browser runners; they do not add a separate workflow or check.
CodeQL runs separately on GitHub.

## Responsive evidence

The quality browser journeys cover live controls, the phone disclosure, sharing recovery and a
pinned event across phone, tablet and desktop widths. To save fresh viewport captures outside the
repository, run:

```bash
EIF_CAPTURE_UI=/private/tmp/eif-review pnpm exec playwright test e2e/quality.spec.ts --project=release
```

Review the actual images for hierarchy, readable labels, canvas space, clipping and notice placement.
Geometric assertions support that review; they cannot establish whether the interface feels good.
Do not overwrite previous dated review evidence with a new run.

## Remaining observations

Chromium automation does not prove native phone sharing, touch behavior on real hardware, spoken
screen-reader output or current agency availability. Use the [visitor walkthrough](visitor-review.md),
record the device and revision, and separate observed results from unanswered questions.
