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
pnpm verify       # every gate CI runs, in one command
pnpm test:e2e     # browser tests on their own, feeds served from e2e/feeds.ts
pnpm test:live    # hits USGS and EMSC for real
```

## What it is

A WebGL globe with two live sources on it. **USGS** is polled over HTTPS; **EMSC** pushes over a
WebSocket. Both are keyless, so the repo renders a full first frame for anyone who clones it with
nothing to sign up for and nothing to configure.

Hover an event for a one-line summary, click to pin it, drag to orbit, scroll to zoom toward the
cursor, search or click a region in the rail to fly there. The archive takes any day that has ended,
including the one you were born on, and ranks it against every other day it holds. Every filter answers as it moves; there is
no apply button. `f` goes fullscreen and takes nothing away, because a full screen showing a planet and
nothing else is a screensaver; the top bar and the left panel fold on their own instead, each where it
costs the picture something. `Still` writes a PNG with the moment it is of
stamped on it and hands it to the share sheet where there is one. A permalink carries the camera, the filters, the moment, the archived day, the
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

## Hosting

`wrangler.toml` has **no `main`**. With no Worker script, asset requests are answered without
invoking a Worker at all, so the running cost is zero invocations rather than a small number of
them. Both feeds are reached straight from the browser, which is what makes that possible.

```bash
pnpm run deploy
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

**The browser suite gates the deploy without ever having been green on a runner.** Its first CI run went
69 green and 3 red in 29 minutes, at one worker with tripled budgets, so contention was not the
explanation. Two of the three were assertions that measured the machine rather than the app - a camera
position compared as a rounded string, and a fixed sampling window standing in for "the tour narrated" -
and both are fixed. The third, a link carrying a cross-section, opens the panel locally in 12.9 seconds
and was not found in 30 on the runner: a factor of thirty on one step, not a slowness story. It needs
the trace, which the first run did not upload because the job pointed at `playwright-report/` where the
config writes `test-results/`. Gating on it now is the deliberate choice - a deploy that ships past a red
browser suite is what the job exists to stop - and it may well block the next merge.

**The build-mode run skips seven tests.** `pnpm test:e2e:build` exercises `dist` and is the stronger
gate against a bundler-only failure - a purged Tailwind class, a mis-split dynamic import, both of
which have shipped here - but the tests that reach for `window.__globe` skip there by construction,
because a production bundle should not carry a debug surface. It is a deliberate pre-release run.

**The eclipse shadow is a picture, never a forecast.** The lunar series is good to about a tenth of a
degree, which at sixty Earth radii of lever arm is roughly 670km on the ground, and UTC stands in for
Terrestrial Time for another 70km. Fine against a penumbra 3,500km wide, useless for telling anybody
when to look up, and the legend says so.

**Opening on a week costs 1.5MB on load.** `usgsSeedFor` asks USGS for `all_week` above a day, where
the daily feed is a fraction of that, and the seed comment argues that cost belongs on a click rather
than a page load. It is a real argument and it lost: an app that opens with five of its layers empty
is paying a worse price in a currency that file does not measure. The trade is deliberate and it is
the first thing to revisit if the load ever matters more than the layers.

**The flat map still opens with no events on screen.** The rail there carries the key, which cannot
float over a map that fills its own rectangle, and after trimming the region index and the two
headline rows it still totals about 860px against 854px of rail - the list begins six pixels below
the fold. The globe shows five. Closing that needs a decision about what the map's rail is for, not
another trim.

**No demo video.** The write-up asks for one and there is none, because recording it is not
something this build could do.
