# Quality checks

Run `pnpm run verify` with the runtime selected by `.nvmrc`. The core checks cover dependency
advisories, repository/documentation rules, CSS, types, lint, formatting, deterministic source tests,
memory/performance budgets and the production build. Browser verification then reuses that local build.
Standalone `pnpm run test:e2e` builds before starting its release server.

## Browser boundaries

Browser runners use Ubuntu 24.04 to keep their graphics and system dependencies
stable across GitHub runner-image migrations.

- The release project uses port 31600 and the ordinary production bundle.
- The development project uses port 31601 for tests tagged `@dev` that inspect camera/store state.
- Each test belongs to one project. The normal suite retains every journey without a second copy
  of the whole suite or production skips. `pnpm run test:e2e:build` deliberately selects release only.
- Both servers belong to the test run. An occupied port fails instead of reusing an unknown preview.
- Recorded feeds replace the external agency calls and EMSC socket. These tests do not establish
  current provider availability; `pnpm run test:live` is an explicit, separate check.

One software-rendered globe runs per runner. `tools/browser-shards.mjs` distributes adjacent tests
round-robin across isolated shards, so the responsive and motion cases do not all land on one runner.
Every test belongs to exactly one shard; an unsharded run keeps the complete inventory.
CI keeps core checks and browser runners parallel, then deploys the assets from the successful
core build only after every shard passes. Failure traces and screenshots remain available.

Accessibility journeys scan live and pinned states at phone and desktop widths with axe.
They check landmark structure, visible-label matching and the applicable automated accessibility rules.
These cases share the existing browser runners; they do not add a separate workflow or check.
CodeQL runs separately on GitHub.

Observatory journeys test fresh storage, scene changes, source scope, narrow phones, guided-tour
controls and returning to saved settings. Existing instrument journeys explicitly select Explore
in the recorded-feed fixture. This keeps their original control assertions while testing the
first-visit presentation separately.

Guided-path checks cover manual stepping, shared-canvas identity, return focus, finishing into free
exploration and keeping the general-sky time through Moonfall and Meteor Nights. Narrow-phone
coverage checks playback labels and reachable onward links. Audio checks establish that a gesture
is required, pitch follows the measured value and leaving the view closes the voice; unit checks
cover finite inputs, throttling, hidden-tab silence and voice cleanup. Catalogue and preview checks keep story
destinations and recorded thumbnail coverage aligned with the available views.

Visit checks cover scene discovery, local bookmarks, resume after a new page visit, measured float
depth and refused storage. Clip checks decode the actual browser-produced video, check rendered
pixels and source/date captions, and verify download and object-URL disposal. Controller tests cover
time limits and cancellation; privacy tests reject extra analytics fields and unknown categories.

## Responsive evidence

The quality browser journeys cover live controls, the phone disclosure, sharing recovery and a
pinned event across phone, tablet and desktop widths. To save fresh viewport captures outside the
repository, run:

```bash
EIF_CAPTURE_UI=/private/tmp/eif-review pnpm exec playwright test e2e/quality.spec.ts --project=release
```

Review the actual images for hierarchy, readable labels, canvas space, clipping and notice placement.
Geometric assertions support that review; they cannot establish whether the interface feels good.
Keep each run in an ignored local output directory; historical reviews remain in Git history.

## Remaining observations

Chromium automation does not prove native phone sharing, touch behavior on real hardware, spoken
screen-reader output or current agency availability. Use the [visitor walkthrough](visitor-review.md),
record the device and revision, and separate observed results from unanswered questions.

## Review artifacts

Keep generated screenshot sets, videos, traces and run reports in ignored
`test-results/` output or a temporary local directory. CI artifacts should expire.
Commit authored design references and a small curated set of README images only;
keep runtime and installation assets separate. Earlier audit records remain in Git
history. Use synthetic data and remove private information from shared evidence.

Story thumbnails in `src/assets/story-previews/` are curated runtime assets with origin sidecars.
Keep the full captures used to produce them in temporary review output. A recorded thumbnail is
neither evidence of current feed availability nor a live observation.

For a local animation recording, set `EIF_CAPTURE_MOTION=1` when running
`pnpm run test:e2e e2e/cinematic.spec.ts e2e/planetarium.spec.ts e2e/unfold.spec.ts e2e/section-fold.spec.ts`.
Normal verification keeps video capture off. Recorded output follows the temporary-artifact policy above.
