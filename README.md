# First Motion

> Earthquakes arriving live from two seismic agencies, on a globe that only moves when the data does.

Named after the seismology term for the initial polarity of a P-wave arrival: the very first thing
an instrument records when a wave reaches it.

```bash
pnpm install
pnpm dev          # http://localhost:31600
pnpm check        # typecheck + tests + build
pnpm test:e2e     # browser tests (needs the real feeds)
pnpm test:live    # hits USGS and EMSC for real
```

## What it is

A WebGL globe with two live sources on it. **USGS** is polled over HTTPS; **EMSC** pushes over a
WebSocket. Both are keyless, so the repo renders a full first frame for anyone who clones it with
nothing to sign up for and nothing to configure.

Hover an event for a one-line summary, click to pin it, drag to orbit, scroll to zoom toward the
cursor, click a region in the rail to fly there. Every filter answers as it moves; there is no apply
button. A permalink carries the camera, the filters and the pinned event.

## The budget was $0, and it made the project better

Not "cheap": zero, including keys that are free but require a signup, because a project that cannot
render its own first frame without registering somewhere has no first thirty seconds.

That ruled out the obvious second source. OpenSky moved to OAuth2 client credentials and every AIS
provider wants a key, so the pair became **two agencies that both report earthquakes globally**.

Which means they report *the same earthquakes*. The same rupture arrives twice, seconds apart, under
different identifiers, on different magnitude scales, from epicentres kilometres apart. Two
unrelated feeds would have proved the adapter interface. Two overlapping feeds prove the adapter
interface **and** force real identity resolution, a reconciliation policy, and an interface that can
show disagreement without hiding it.

That is a harder problem and a better one. [Two agencies, one earthquake](RECONCILIATION.md) is the
long-form write-up.

## Nothing on screen claims more than it knows

- **The window states its own left edge.** With no backend the buffer starts when the page loads, so
  the rail reads `since 19:40` until 24 hours have genuinely passed, then switches.
- **Magnitudes carry their scale.** `M 5.2 Mww`, never a bare number, because the two agencies
  disagree and a bare number implies a precision that does not exist.
- **Deduplication is named.** The rail shows both raw counts, the distinct total, and how many
  events both agencies reported.
- **Collapsed markers say so.** A cluster wears a chrome ring, because radius and hue both already
  mean magnitude and neither was free to mean "several".
- **Quarry blasts stay quarry blasts.** USGS publishes a seismic feed, not an earthquake feed.
- **The wavefront's playback rate is printed.** Real P-wave velocity advances the front 0.16 pixels
  per second, which reads as a still image, so it plays at ×20 and the rail says ×20.

## The accessibility layer is a feature, not a checklist

The canvas is `aria-hidden`, so for a screen reader the parallel event list **is** the product. It
carries the same information rather than a summary, ordered by recency because arrow-keying around a
sphere spatially is disorienting. One tab stop, then arrows. A polite live region announces events
above a threshold the viewer sets, defaulting high, because a busy feed floods a screen reader until
the person closes the page.

A browser test drives the whole app with the canvas set to `visibility: hidden`.

## Design and decisions

- **[DESIGN.md](DESIGN.md)** is the visual authority. Its central rule is that the interface carries
  **no hue at all**: the warm default ramp and the colourblind-safe ramp together occupy most of the
  wheel, so achromatic chrome is the only choice that survives both.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** is the decision log, written the day each decision was made
  rather than reconstructed. It keeps the wrong guesses and the measurements that killed them.
- **[PLAN.md](PLAN.md)** is the build sequence, with the gate each step had to pass.

DESIGN.md's banned list is not a list. It is [nine browser tests](e2e/design.spec.ts) asserting that
no chrome element paints a hue, nothing overflows sideways, every updating number has tabular
figures, and nothing is pure black, at three breakpoints.

## Performance

CI gates on **CPU update cost**, not on frame time. A shared runner has no GPU, so a frame time
measured there is noise wearing a unit, and a threshold loose enough to pass is loose enough never
to fail. What regresses in code is the per-frame work: filter predicates, projection maths, buffer
writes.

| Events | Budget | Measured |
|---|---|---|
| 1,000 | 1.0ms | 0.12ms |
| 10,000 | 4.0ms | 1.10ms |
| 50,000 | 12.0ms | 6.26ms |
| 50,000, clustered | 12.0ms | 6.22ms |

Fastest of 40 runs on an Apple Silicon Mac under Node 22. The fastest rather than the median,
because every slower sample is the code plus interference and the interference is never the thing
under test. Memory is asserted flat across four simulated hours.

## Hosting

`wrangler.toml` has **no `main`**. With no Worker script, asset requests are answered without
invoking a Worker at all, so the running cost is zero invocations rather than a small number of
them. Both feeds are reached straight from the browser, which is what makes that possible.

```bash
pnpm deploy
```

**Merging to `main` deploys.** The workflow checks first (typecheck, tests with `--expose-gc` so the
memory gate cannot skip itself, build) and only deploys if that passes. One repository secret,
`CLOUDFLARE_API_TOKEN` with `Workers Scripts:Edit`, is the entire setup: no account id, no D1
permission, and the custom domain is created by Wrangler on first deploy.

[DEPLOY.md](DEPLOY.md) has the whole picture, including what to do when it goes wrong.

## What is wrong with it

**Aftershocks can be swallowed.** Association uses time and distance, so a genuine aftershock within
30 seconds and 150km of a mainshock is folded into it. Separating them needs waveform data no
keyless feed carries. The detail panel lists every merged reading, so a wrong merge is visible
rather than hidden, but it is a real limitation and not a rare one during a sequence.

**The window cannot go back before you opened the page.** There is no backend, so time scrubbing was
rejected rather than shipped as a worse version of itself.

**Browser tests are not in CI.** They wait on two real agencies, so a quiet planet or an agency doing
maintenance would fail the build for reasons that are not the code's fault. Routing the feeds to the
committed fixtures would fix this and has not been done.

**The globe is a poor fit for very dense sequences even with clustering.** 400 events in the Flores
Sea collapse to a handful of markers, which is legible and is still not the same as being able to
read the sequence. A timeline would serve that better and is out of scope.

**No demo video.** The write-up asks for one and there is none, because recording it is not
something this build could do.
