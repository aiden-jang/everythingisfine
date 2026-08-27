# Everything Is Fine

> Everything happening to the planet right now, on a globe that only moves when the data does:
> earthquakes from two agencies that disagree, storms, volcanoes, wildfires, floods and the aurora.

Earthquakes are still the centre of it - they are the only layer two agencies argue about, and the
reconciliation of those two accounts is the thing the app is really for. Everything else is drawn
around them, achromatic and by shape, so colour never stops meaning magnitude.

Live at <https://everythingisfine.aidenjang.com>.

```bash
pnpm install
pnpm dev          # http://localhost:31600
pnpm check        # typecheck + tests + build
pnpm test:e2e     # browser tests, feeds served from e2e/feeds.ts
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

## Where the data comes from

Live seismicity from **USGS** (polled) and **EMSC** (WebSocket), including USGS's "Did You Feel It"
reports where anybody filed one. Storms, volcanoes, wildfires and floods from **GDACS**, each carrying
the agency GDACS credits for it - JTWC for a Pacific typhoon, and so on. Coastlines from **Natural Earth**,
public domain. Plate boundaries from **PB2002** (Bird, P., 2003, *An updated digital model of plate
boundaries*, Geochemistry Geophysics Geosystems 4(3)), public domain, simplified to 0.15 degrees.

Stars from the **Yale Bright Star Catalogue** (BSC5, Hoffleit & Warren, 5th revised edition), down to
magnitude 6. Constellation figures from **d3-celestial**, copyright (c) 2015 Olaf Frohn, BSD 3-Clause,
whose licence asks that this notice be retained. The moon's position is computed, not tabulated: the
abridged lunar series, good to about a tenth of a degree.

## Globe and map

One geometry, projected in the vertex shader, so switching unwraps the planet rather than cross-fading
two scenes. The globe is the default; the map is for comparing margins that a sphere makes you turn to
see. Every layer carries the longitude and latitude it was built from, rather than recovering them
from the sphere, because recovering them breaks wherever a shape crosses the date line or touches a
pole.

Shift-drag a line across the map for a cross-section, and the link carries it: distance along, depth down, drawn at 1:1 where
it fits and with the vertical exaggeration printed where it does not. It is the only view that shows
depth as structure rather than as a filled or hollow ring, and across a subduction zone the
earthquakes draw the slab. Plate boundaries are ticked along the distance axis, so the picture says why
the slab is there, and any mark can be clicked to pin the event it stands for.

The map has no edges: pan east past Kamchatka and the Aleutians come round again. The world is drawn
once per copy that reaches the screen rather than wrapped per vertex, which cannot tear the triangles
that straddle the seam.

## Day and night

The globe is lit from the real subsolar point, computed from the clock with NOAA's solar position
algorithm. The geography dims on the night side; the earthquakes do not, because one at 3am is not a
smaller earthquake.

## Sequences

Pinning an event shows what happened around it on one axis: time. Every event within 150km appears as a
tick placed against the pinned one, so you can see whether the largest has already been. It is stated
as well as drawn, because "the largest nearby was M 4.9, 1.1h after it" is the fact somebody wants and
a picture of it is not the same thing.

## Revisions

An agency's first magnitude is automatic; a reviewed one arrives later and is often different. Rather
than swapping the number silently, the panel says what it first said, the row is marked, and the
header counts how many events have changed. Only a changed magnitude counts as a revision, because
both USGS feeds re-serve every event they hold on every poll.

Magnitude and depth are both tracked, and the panel prints whichever moved. The epicentre is revised
too and is not: it shifts a few kilometres on most revisions, which is not worth a line, and the
position on screen already shows it.

## What is wrong with it

**Aftershocks can be swallowed.** Association uses time and distance, so a genuine aftershock within
30 seconds and 150km of a mainshock is folded into it. Separating them needs waveform data no
keyless feed carries. The detail panel lists every merged reading, so a wrong merge is visible
rather than hidden, but it is a real limitation and not a rare one during a sequence.

**The window cannot go back beyond the seed.** Both feeds seed 24 hours on their first request and
there is no backend, so 24 hours is the hard edge and time scrubbing beyond it was rejected rather
than shipped as a worse version of itself.

**Browser tests run against the dev server, not a build.** They no longer touch the network, but they
exercise `pnpm dev` rather than `dist`, so a bundler-only failure would get past them.

**Browser tests are not in CI.** They wait on two real agencies, so a quiet planet or an agency doing
maintenance would fail the build for reasons that are not the code's fault. Routing the feeds to the
committed fixtures would fix this and has not been done.

**You cannot walk a swarm event by event.** 400 events in the Flores Sea collapse to a handful of
markers on the globe. Pinning one shows its whole sequence in time, every neighbour within 150km
placed against it, so the shape is readable; what is not there is stepping through them one at a time.

**Hovering an hour is pointer-only.** The strip's real job, setting the window, works from the
keyboard; the link that dims the globe to one hour does not, and there is no discoverable keyboard
gesture for it.

**No demo video.** The write-up asks for one and there is none, because recording it is not
something this build could do.
