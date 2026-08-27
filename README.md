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
cursor, search or click a region in the rail to fly there. Every filter answers as it moves; there is
no apply button. `f` hides the chrome and leaves the planet; `Still` writes a PNG with the moment it
is of stamped on it. A permalink carries the camera, the filters, the moment, the archived day, the
pinned event and any cross-section drawn on the map.

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

Every control answers a keyboard, including the two the canvas made easy to forget: the camera keys
live on the window rather than the canvas, and the activity strip's twenty-four bars are real buttons
on one tab stop, so "which of these happened at 05:00" is not a pointer-only question.

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

Budgets are in **reference units**, not milliseconds: a fixed synthetic workload is timed in the same
process moments earlier and the budget is a ratio against it. Both numbers move together when the
machine is busy and the ratio does not, which is the property an absolute threshold never had - it
failed three times on unchanged code.

| Events | Budget | Measured |
|---|---|---|
| 1,000 | under 0.15 ref | 0.10 ref, 0.16ms |
| 10,000 | under 1.05 ref | 0.96 ref, 1.57ms |
| 50,000 | under 7.0 ref | 4.45 to 4.91 ref, 7.3 to 8.1ms |
| 50,000, hour held | under 7.0 ref | 5.24 to 5.35 ref |

Fastest of 40 runs on an Apple Silicon Mac under Node 22. The fastest rather than the median,
because every slower sample is the code plus interference and the interference is never the thing
under test. Memory is asserted flat across twelve simulated hours, against a 0.5MB budget checked by
making it fail.

## Hosting

`wrangler.toml` has **no `main`**. With no Worker script, asset requests are answered without
invoking a Worker at all, so the running cost is zero invocations rather than a small number of
them. Both feeds are reached straight from the browser, which is what makes that possible.

```bash
pnpm deploy
```

**Merging to `main` deploys.** The workflow checks first - typecheck, unit tests with `--expose-gc` so
the memory gate cannot skip itself, and the build - and only deploys if that passes. The browser suite
runs in its own job alongside it and does not yet block the deploy; see below. One repository secret,
`CLOUDFLARE_API_TOKEN` with `Workers Scripts:Edit`, is the entire setup: no account id, no D1
permission, and the custom domain is created by Wrangler on first deploy.

[DEPLOY.md](DEPLOY.md) has the whole picture, including what to do when it goes wrong.

## Where the data comes from

Five hosts, no keys, nothing cached behind anything.

**Live seismicity** from **USGS** (polled, `earthquake.usgs.gov`) and **EMSC** (WebSocket,
`seismicportal.eu`). Both are aggregators, so each reading also names the network that computed it - `hv`
for the Hawaiian Volcano Observatory, `BMKG` for Indonesia's agency - and the panel says both. USGS's "Did
You Feel It" counts and ShakeMap intensities come with them where anybody filed or anything was modelled.

**Storms, volcanoes, wildfires and floods** from **GDACS** (`gdacs.org`), each carrying the agency GDACS
credits for it - JTWC for a Pacific typhoon, and so on. On an archived day those five come from **NASA
EONET** (`eonet.gsfc.nasa.gov`) instead, because GDACS's lists are flagged current rather than queryable
by date.

**The aurora** from **NOAA SWPC**'s OVATION model (`services.swpc.noaa.gov`). A forecast for a stamped
minute rather than an observation, which is why it has no archived branch: there is no past to ask for.

**Coastlines** from **Natural Earth**, public domain. **Plate boundaries** from **PB2002** (Bird, P., 2003,
*An updated digital model of plate boundaries*, Geochemistry Geophysics Geosystems 4(3)), public domain,
simplified to 0.15 degrees.

**Stars** from the **Yale Bright Star Catalogue** (BSC5, Hoffleit & Warren, 5th revised edition), down to
magnitude 6. **Constellation figures** from **d3-celestial**, copyright (c) 2015 Olaf Frohn, BSD 3-Clause,
whose licence asks that this notice be retained.

**The rest of the sky is computed, not tabulated**, and each states its own accuracy where it is used: the
sun from NOAA's solar position algorithm, good to about 0.01 degrees; the moon from the abridged lunar
series, about a tenth of a degree; the planets from the standard approximate Keplerian elements for 1800
to 2050. Eclipses fall out of the first two multiplied together, which puts the shadow within a few
hundred kilometres - a picture, never a forecast.

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

## Time

The window is 24 hours, 7 days or 30 days, chosen by name rather than dragged. The activity strip
below it is always exactly that window, divided into 24 bars, so the strip and the globe can never
disagree about what is on screen.

A cursor under the strip parks the globe at a moment inside the window and plays forward from there.
It is the entrance replay made permanent: the event layer already takes a reveal limit, so nothing
here invents an event, reorders one or changes a time. `,` and `.` step it a bar at a time, because
the arrow keys are the camera.

**Any past day can be loaded**, from both agencies' FDSN endpoints, which take an arbitrary date
keylessly. The risk in that feature is a chrome that goes on saying "live" over a globe showing last
March, so it is a mode: the live sources stop, the set is replaced, and every claim of liveness in
the interface reads the snapshot and stands down. A dozen notable days are listed as the way in,
each with its own event count, because 1960-05-22 holds the largest earthquake ever recorded and six
events at M2.5+ - which is the network of the day, not a quiet planet.

## The sky

Real stars, from the Yale Bright Star Catalogue down to magnitude 6, turned by sidereal time so
Orion is over the Pacific in January and can be found. The moon is at its real distance and its real
size, which is half a degree and looks small, and its phase is not computed anywhere: lighting a
sphere from the direction the sun already points gives the crescent for free, including which way the
horns face. Five planets move against it. On the few days there is one, the moon's shadow falls on the
Earth, which is the sun's direction and the moon's position multiplied together.

Constellation figures are behind a toggle, because they are the one layer here that measures nothing.
Nobody discovered that seven stars are a plough.

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

**Aftershocks can be swallowed.** Association uses time, distance and magnitude, so a doublet within
one magnitude unit, 30 seconds and 150km of a mainshock is folded into it. Separating that needs
waveform data no keyless feed carries. The detail panel lists every merged reading, so a wrong merge
is visible rather than hidden, but it is real and not rare during a sequence.

**The archive is earthquakes plus a second-best.** A past day gets its seismicity from both agencies'
FDSN endpoints, which is the real thing. Its storms, fires, floods and volcanoes come from NASA EONET
instead of GDACS, because GDACS filters its *current* pool by date rather than holding an archive.
The aurora has no archived branch at all and never will: NOAA publishes a forecast for a stamped
minute, so there is no past oval to ask for.

**The browser suite runs in CI but does not gate the deploy.** It load-tests itself: a full parallel run
puts two design tests red that both pass in isolation in 32 seconds, and `design.spec.ts` on its own
runs 27 green in two minutes. The config drops to one worker and doubles the timeouts under CI, which
should remove the contention, but a runner has fewer cores and software-rendered WebGL and that has
not been observed yet. It becomes a gate once it has been green on a runner.

**The build-mode run skips seven tests.** `pnpm test:e2e:build` exercises `dist` and is the stronger
gate against a bundler-only failure - a purged Tailwind class, a mis-split dynamic import, both of
which have shipped here - but the tests that reach for `window.__globe` skip there by construction,
because a production bundle should not carry a debug surface. It is a deliberate pre-release run.

**The size distribution reads wrong on fixture data.** `e2e/feeds.ts` draws magnitudes at a b-value
of 0.625 where the Earth sits between 0.8 and 1.2, so the chart quotes "about 5 times as many" on
fixtures against "about 10" on a real feed. Changing it moves the count at every magnitude threshold
and half the browser suite asserts on those.

**The eclipse shadow is a picture, never a forecast.** The lunar series is good to about a tenth of a
degree, which at sixty Earth radii of lever arm is roughly 670km on the ground, and UTC stands in for
Terrestrial Time for another 70km. Fine against a penumbra 3,500km wide, useless for telling anybody
when to look up, and the legend says so.

**No demo video.** The write-up asks for one and there is none, because recording it is not
something this build could do.
