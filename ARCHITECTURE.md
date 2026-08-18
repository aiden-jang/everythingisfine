# First Motion: decisions

Written on the day each decision was made, not reconstructed at the end. A reconstructed log reads
as reconstructed: every alternative loses for a clean reason and nothing was ever tried and
abandoned. The entries worth keeping are the ones where a measurement contradicted the reasoning,
and those are the first thing memory smooths away.

Numbers here come from a measurement or a test. Where a number was produced by hand on one machine,
the machine is named.

---

## No Worker script at all

`wrangler.toml` has no `main`. Cloudflare answers asset requests without invoking a Worker, so the
running cost is zero invocations rather than a small number of them.

This only works because nothing needs a proxy, which was verified rather than assumed before the
architecture was committed to. USGS returns `access-control-allow-origin: *`, and the EMSC endpoint
returns `HTTP/1.1 101 Switching Protocols` with WebSocket exempt from CORS by construction. A single
keyed source anywhere in the design would have forced a Worker to hold the secret and taken the zero
with it.

**Rejected:** OpenSky as the push source. It moved to OAuth2 client credentials, and although
registration is free it is still a secret in an env file, which breaks the rule that the repo must
render its first frame for anyone who clones it.

---

## Vector coastlines, not a satellite texture

Natural Earth 110m, 54KB raw and 21KB gzipped, triangulated at load.

The reason is not sharpness, it is the palette. A photographic earth puts green, ochre and white
across the whole sphere, and every one of those competes with the data ramp, so a viewer ends up
reading hue in two languages at once. Land has to be chrome.

Sharpness is the second reason and it is nearly free: the fill is a flat colour, so it needs no
resolution at all. Only the boundary does, and the boundary is a line.

---

## The land fill is depth-ordered, not depth-tested

**This is the entry that cost the most and it started as a wrong guess.**

Triangulation happens in flat degrees, so a triangle spanning a continent's interior chords through
the sphere instead of following it. The first fix was to lift the land shell fractionally proud of
the ocean, sized from the reasoning that two subdivision passes would leave a worst-case edge near
10 degrees, sagging `1 - cos(5deg) = 0.00095` of a radius. The shell was lifted by 0.002.

Measuring said the worst edge was **31.3 degrees, sagging 0.037 radii**: eighteen times the lift.
The ocean had been cutting up through the middle of every large landmass the whole time, at a
contrast low enough that it read as shading rather than as a bug. The guess was wrong because it
assumed something about the triangles earcut emits in a polygon's interior, and earcut makes no such
promise.

A bigger lift is the wrong fix, because a lift large enough to clear the sag floats the land visibly
off the horizon at the limb. Turning the depth test off removes the question entirely: back-facing
land is still discarded, because winding survives the projection, so ordinary front-face culling
hides the far hemisphere exactly as it does for the ocean sphere. The lines cannot do this, since a
line has no facing, so the graticule and coastline keep their depth test.

Subdivision went to three passes for silhouette accuracy rather than for occlusion, and
`maxEdgeDeg` is now a permanent statistic so that a future data or densify change cannot move it
silently.

**Current geometry:** 171,815 vertices, 303,360 triangles, 4,998 coastline segments, max edge 24.4
degrees.

---

## The camera orbits; the globe never moves

The first pass rotated two nested groups and left the camera parked on +Z. It draws an identical
picture and it is the wrong model as soon as anything has to be picked.

Every question this app asks is geographic: what is under the pointer, where is this event, where
should the camera fly, what does a permalink encode. With the geometry pinned to true coordinates
those are all answered in degrees. With the world spinning underneath, every one of them needs
undoing by a rotation first.

---

## Zoom is magnification, not distance

Written first as a multiple of the framing distance, which is the same information and reads
backwards at every use site. The wheel handler duly zoomed out when scrolled up, and the bug was
invisible on the page because `zoom * 1.5` looks exactly like zooming in.

Naming the quantity after what the user perceives rather than after what the camera stores removed
the whole class of mistake. Clamped to 0.75 and 3.

---

## Dragging inverts a perspective projection, not an orthographic one

Three attempts, and both wrong ones looked reasonable in code.

1. **Pixels divided by the globe's on-screen radius.** Treats the sphere as flat. A 140px drag left
   the grabbed coastline **4.5 degrees** behind.
2. **`asin(px / R)`.** Treats it as an orthographic sphere, which is the projection a sphere has only
   when viewed from infinity. This camera sits 4.5 radii away, and the two cases differ by a factor
   of `d/(d-1)`, about 29% here. It made the slip *worse*, at **5.5 degrees**.
3. **The actual inverse.** For a point `sigma` around from the sub-camera point,
   `px = focal * sin(sigma) / (d - cos(sigma))`, which inverts in closed form to
   `sigma = asin(u*d / sqrt(1 + u^2)) - atan(u)` with `u = px / focal`. Exact, not fitted: at the
   limb it returns `acos(1/d)`, precisely how much of a sphere is visible from distance `d`.

Slip after a 140px drag fell to **0.2 pixels at the equator and 0 pixels vertically**.

The lesson worth keeping is that step 2 felt like a fix. It was a more sophisticated wrong model,
and only measuring at a latitude where the answer is analytically known separated it from a right
one.

---

## North stays up, and the grab is not exactly 1:1

The camera turns about the polar axis, so a horizontal drag moves the grabbed point along its
parallel. A parallel at latitude L is only `cos(L)` as long as the equator, so the drag rate is
divided by `cos(lat)`, floored at 0.25 to stop it diverging at the pole.

That correction helps but cannot reach zero, and the residual is not a bug to be fixed later:

| Camera latitude | Slip after a 140px drag |
|---|---|
| 0 | 0.2 px |
| 12 (framing) | 4.4 px |
| 40 | 17.5 px |
| 70 | 53.3 px |

Exact tracking requires rotating about the axis perpendicular to the drag, which rolls the globe so
that north is no longer up. For a map instrument, north-up is worth more than an exact grab, and
every general-purpose globe makes the same trade. The framing shot sits at 12 degrees, and most
seismicity sits between -45 and +60.

---

## Four bundle budgets, not one

three.js is 127KB gzipped and fixed. Against a single combined ceiling a 20KB regression in
application code reads as 10% drift; against the thing that actually changed it is a third of the
budget. Vendors are paid for once; application code and geometry are what move.

| Chunk | Budget | At step 3 |
|---|---|---|
| Application code | 60KB | 4.1KB |
| Coastline geometry | 40KB | 26.5KB |
| three.js | 135KB | 127.7KB |
| React | 50KB | 45.7KB |

React's 45.7KB is the reserve if application code ever needs it: nothing here uses React beyond
components and effects, so `preact/compat` reclaims most of it. That is a reserve, not a plan.

---

## The frame loop runs only while something moves

Ambient rotation is banned, so an idle globe has nothing to redraw. A permanent animation frame loop
would spend every frame of every idle minute drawing an identical picture, and this is a page meant
to be left open for an hour.

A drag, flick, zoom or reset starts the loop; the frame after the motion settles ends it. Verified
by driving the integrator directly: a hardest-possible flick coasts 65.5 degrees, stops after 1.88
seconds, and `step()` then returns false and keeps returning false.

**Momentum is capped at 200 deg/sec.** Uncapped, a hard flick measured 131 degrees of coast, a third
of the planet from one gesture.

**The reset spring is critically damped**, which falls out of DESIGN.md's stiffness 100 against
damping 20. Measured: an arbitrary camera returns to the framing shot in 0.97 seconds with no
overshoot. Overshoot on a reset reads as a bounce, and a bounce says "animation" where this needs to
say "put back".

---

## Eviction is by arrival, not by origin time

It sounds like the lazy choice. It is the honest one.

With no backend the window genuinely begins when the page loads, which is why DESIGN.md section 10
makes the rail read "since 21:40" rather than "last 24 hours". Dropping the oldest arrival is
precisely that window, and it is O(1). Evicting by origin time would need a heap in order to
describe a window the app does not actually have.

Origin time still decides what is *shown*: the filter selects on when the ground moved, the store
evicts on when we heard about it. The two orderings answer different questions, and collapsing them
gets one of them wrong. An event that happened twenty minutes ago and reached us a second ago
belongs twenty minutes back on a timeline, not at the front.

**Association is bucketed by time.** Two readings can only be the same rupture within 60 seconds, so
quakes are indexed in 60-second buckets and a candidate search touches three of them. Without it,
every arriving reading would be compared against all fifty thousand held events.

**Known false positive, stated rather than discovered later.** A large event's immediate aftershocks
can fall inside both the time and distance windows and will be folded into the mainshock. Separating
them needs waveform data no keyless feed carries. The interface never claims otherwise: the detail
panel lists every reading it merged, so a wrong merge is visible rather than hidden inside a count.

---

## The four-hour test asserts structure, and only corroborates with the heap

The failure this is guarding against is not "memory crept up". It is "an index kept a key after its
quake was evicted", and that is directly observable, deterministic, and names the actual bug.

So the gate is structural: after four simulated hours and more than a full extra turnover of the
buffer, occupied slots equal capacity exactly, the reading index stays bounded by capacity times
sources, and the bucket index does not grow. The bucket index is the one that leaks silently, since
an emptied `Set` that is never deleted costs nothing visible and accumulates one entry per minute of
wall clock forever.

Heap is measured too, and it is corroboration rather than the gate: **1.41MB of growth across four
simulated hours**, against a 5MB threshold.

**The heap test skips itself rather than passing.** The first version returned early with a console
note when `gc` was unreachable, and the default reporter swallows stdout for passing tests, so it
reported green whether or not it had measured anything. That is "an unenforced benchmark is quietly
false within a month" in miniature. It now shows in the summary as skipped, and CI runs
`pnpm test:heap` so it cannot skip there.

---

## The contract was written before the second source existed

PLAN.md insisted on this ordering and it earned its place. A contract written after both adapters
exist is shaped by both, and quietly describes the intersection of what they already do rather than
what a source owes the app. Written first, adding EMSC means running the file unchanged, and any
assertion that turns out to be USGS-specific is a finding rather than an edit.

Nothing in the suite mentions HTTP, JSON, sockets, intervals or magnitudes. It asserts four things:
what a reading is, that stopping stops, that a broken transport degrades instead of throwing, and
that nothing is announced twice.

### The suite was mutation-tested, and it failed the test

A contract that has never failed is unproven, so two deliberate bugs were introduced.

Sabotage one, a `stop()` that leaks its timer, **was not caught by the test written for it**. "Goes
completely quiet after stop, and leaves nothing behind" checked `pendingTimers` *after* advancing
the clock, and by then the stray timer had fired, removed itself from the map, found `handlers`
already null, and emitted nothing. The leak was real and every downstream symptom was masked. The
assertion now runs immediately after `stop()`, which is the only moment the question means
anything, and it catches the sabotage.

Sabotage two, emitting the whole feed every poll instead of only what changed, was caught by four
tests, which is the right amount.

---

## The live test found a bug the fixtures structurally could not

`browserRuntime` used `window.setTimeout`. Under Node it throws, and because scheduling sat inside
the poll's `try`, the throw was caught and reported as `failing`. **The feed was perfectly healthy
and the app said the network was down.**

A source that blames the network for its own bugs is worse than one that crashes, because the status
it shows is a lie and the retry it schedules will never help. The try block now contains the
transport and nothing else; scheduling, status and parsing sit outside it, so our own faults
propagate loudly instead of being laundered into a plausible HTTP-shaped excuse.

Recorded fixtures could never have found this. They answer "does the parser handle this shape", and
the bug was in the runtime the fixtures replace. That is the entire argument for keeping one live
test, and for it being excluded from CI rather than deleted.

The other live assertion is that USGS still sends `access-control-allow-origin: *`. If that ever
stops being true the app needs a proxy Worker, which ends the zero-invocation deployment. Better to
learn it from a deliberate test than from a blank globe in someone's browser.

---

## Parsing assumes the feed is having a bad day

Every field USGS publishes has been null in a real response at some point, so every one is checked.
Three choices worth keeping:

- **An event with no magnitude is skipped, and the skip is counted.** Magnitude drives both radius
  and ramp position, so an event without one cannot be drawn honestly. Discarding is right;
  discarding invisibly is not.
- **A missing magnitude scale becomes `unknown`, not `Mww`.** Defaulting to a real scale puts a
  specific false claim on screen.
- **A missing depth becomes `NaN`, not zero.** Zero is a real seabed value and would be indistinguishable
  from a genuine reading.

**Quarry blasts are kept, not filtered.** USGS's hourly feed is a seismic feed, not an earthquake
feed. Dropping non-earthquakes loses real data a seismometer recorded; drawing them unlabelled calls
a mine an earthquake. So `kind` travels with every reading and is named on screen.

---

## The association windows were guesses; now they are measurements

They started at 60 seconds and 200km, which sounded reasoned and was not. Measuring 24 hours of real
M2.5+ activity across both catalogues, 50 of 53 USGS events had an EMSC counterpart, and the
agencies agree far more closely than the guess assumed:

| | median | p95 | max |
|---|---|---|---|
| origin-time difference | 0.1s | 3.0s | 16.7s |
| epicentre distance | 0.0km | 19.6km | 135.6km |

The generous window bought nothing and cost something real: at 60s/200km, one of those 50 events
already had **two** EMSC candidates to choose between, and every extra second widens the aftershock
false positive. Tightening to **30s/150km matched exactly the same 50 events** while halving the
time window, so it is strictly better. 20s/100km would have dropped one genuine pair, which is where
the evidence stops supporting further tightening.

`one-quake-both-feeds.json` is one of those pairs, recorded unedited, and the measured deltas are
stored beside it so a future data refresh cannot quietly invalidate the thresholds.

---

## EMSC ran the contract unchanged, and the contract had two bugs

The point of writing the suite first was that adding a second source would either pass or produce a
finding. It produced two, and both were in the harness rather than the adapter, which is the good
outcome:

- **The broken-transport test fed data into a socket it had just declared dead.** A poller has
  nothing to hand over when its fetch fails, so the flaw was invisible with one source. A push
  source has to be told not to deliver, so `deliver` now takes the mode.
- **The backoff test measured each wait against a clock that had already moved.** `retryAt` is an
  absolute moment; subtracting `now()` after advancing ten minutes measures nothing. Statuses are
  now stamped with the time they arrived.

Neither required a change to `emsc.ts`. The adapter itself passed on the first run.

### What the push transport needs that polling did not

- **A bounded seen-set.** A poller can replace its whole set each cycle because the feed restates
  itself. A socket only ever says what changed, so anything remembered accumulates for as long as
  the page is open. Same leak as the store's bucket index, arriving by a different door; capped at
  20,000 identifiers, evicting oldest-first.
- **A guard against mistaking its own teardown for a dropped connection.** Closing a socket fires
  its close handler. Without the guard, `stop()` announces "connection lost" and schedules a
  reconnect for a session the user just ended.
- **Position from `properties`, not `geometry`.** The two disagree by design: the geometry's third
  coordinate is *negative* for depth below the surface, so a 35km-deep event reports `-35.0` there
  and `35.0` in properties. Reading the wrong one puts every earthquake in the sky.

### Recorded socket frames, not reconstructed ones

The EMSC REST catalogue publishes the same feature the socket sends, but says nothing about the
envelope wrapping it. So frames were captured verbatim off the live standing-order socket and
committed. They confirmed the envelope, and they contained a magnitude scale of bare `"m"`, which no
hand-written fixture would have thought to include. That is the argument for keeping recordings
alongside invented edge cases: invented fixtures only contain what you already knew to expect.

---

## Points with a shader, not instanced quads

A marker is a filled circle facing the camera, which is what a point sprite already is. Instancing
would spend four vertices and a per-instance matrix each rebuilding something the hardware does for
free.

Everything per-event is an attribute; everything per-frame is a uniform. The consequence that
matters is that a filter change rewrites two `Float32Array`s and touches no object graph: no meshes
created, none destroyed, nothing for the collector to find at hour four.

**The ramp is a 256-pixel texture, not a colour attribute.** Switching ramps becomes one uniform swap
rather than 50,000 colour rewrites, and more usefully the shader has no way to express a colour that
is not on the ramp. A 50,000-point layer literally cannot drift off-palette.

### Update cost, measured

CI gates on this; it needs no GPU and it is what an accidental allocation shows up in.

| Events | Budget | Measured (median of 25) |
|---|---|---|
| 1,000 | 1.0ms | **0.12ms** |
| 10,000 | 4.0ms | **1.21ms** |
| 50,000 | 12.0ms | **6.91ms** |

**200 consecutive syncs of 50,000 events grew the heap by 0.01MB**, which is over three seconds of
continuous slider dragging at 60fps with no per-event allocation. That number is why `toVec3` is
inlined in the hot loop: it returns a fresh three-element array, and at 50,000 events per tick the
allocation dominates the trigonometry it was hiding.

---

## Additive blending drew chrome, and had to go

Additive was the first choice and the reasoning was sound: overlapping events in a dense margin
should read as brighter rather than as one flat blob. The first frame of real data settled it. Around
twenty events stacked in the Flores Sea summed past the top of the ramp and clipped to **pure white,
which is Instrument, the chrome colour**. The densest and most interesting cluster on the globe was
drawing the one colour reserved for text and focus rings.

No opacity setting fixes that. It is a gamut problem, not a tuning problem: any additive stack
eventually leaves the ramp, and the setting only moves the density at which it breaks. Normal
blending keeps every pixel inside the ramp by construction, and density becomes the clustering job
in step D, which is where it belonged.

---

## The seed window was wrong in DESIGN.md, and the app proved it

DESIGN.md said the buffer is seeded from the last hour of USGS. Wiring it up, the hourly feed held
**8 earthquakes, of which 4 cleared the default magnitude floor**. Four dots is not a live
visualization however genuinely live it is, and section 8's promise about the first frame would have
been false on most loads.

| Feed | Events | Size |
|---|---|---|
| `all_hour` | 8 | 6kB |
| `2.5_day` | 53 | 38kB |
| `all_day` | **227** | 163kB |

So the first request asks for a day and every one after asks for an hour. Polling the daily feed
instead would cost 163kB a minute forever to re-learn 8 events. `2.5_day` was rejected because
discarding everything below magnitude 2.5 discards most of what a seismic network records: the
magnitude floor belongs to the viewer's filter, not to the fetch.

DESIGN.md has been corrected rather than quietly diverged from.

---

## The wavefront rate is derived, and a test keeps it that way

`TRUE_RATE_DEG_PER_S` is computed from `P_WAVE_KM_PER_S / EARTH_RADIUS_KM`, never typed in, and a
test asserts that 80 seconds of front covers 480km. That sentence appears in DESIGN.md 3.3, and a
constant written directly is how a claim like it survives a refactor long after the number stopped
agreeing with it.

Playback is ×20 and the rail prints it. At true rate the front advances 0.16 pixels per second on a
400px globe, so real rate would have been honest and useless at the same time. A test pins `PLAYBACK`
to 20 so the label and the behaviour cannot drift apart.

A circle on a sphere needs two vectors perpendicular to its centre, and building that basis from
the north pole fails when the epicentre *is* the pole. The fallback axis is chosen from whichever
component of the centre is smallest, and a test spawns fronts at both poles and on the antimeridian
and asserts every vertex lands on one shell.

---

## The step-8 gate is tested as a rule, because it cannot be observed

The requirement is that a cold load always has a front expanding in the first frame. That cannot be
watched here: announcements are coalesced through `requestAnimationFrame`, which every headless and
backgrounded context suspends, so any staged "cold load" is one where the handler never runs. This
was discovered by trying: 228 quakes held, zero fronts alive.

Coalescing through rAF is still right, since a hidden tab has nothing to draw and should not be
rewriting GPU buffers. So the rule moved out of the canvas into `frontsFor`, where it can be tested
directly, and the tests say what the rule is: **a 227-event seed produces exactly one front, the
most recent**, while every live arrival gets its own.

The most recent, not the largest. A front means "this just arrived", and picking the biggest instead
would be choosing what to show over what is true.

---

## Overlap, and why clustering is one of the two ceiling-raisers

Markers in dense margins render as crescents rather than circles. It is not a shader bug: with
normal blending, two markers a few pixels apart in different ramp colours look exactly like that.

Measured on a real seed, **149 of 228 events had another event within 40km**. That is the legibility
problem DESIGN.md section 12 picked clustering to solve, and it is now visible rather than
theoretical. It also confirms the choice of clustering over time scrubbing was right for a reason
beyond the ones written down at the time.

---

## The pinned selection is a key, and that is the whole trick

The polish doc calls losing a selection on refresh the most infuriating bug in a live
visualization and says it is easy to write by accident. The accident is holding the selection as an
object or an index. The store updates a quake in place when an agency revises it, so a key stays
valid while the contents change: hold the object and you pin a snapshot, hold an index and you pin
whatever later takes that slot.

Asserted directly against the store rather than checked by hand, across a re-delivered poll, a
magnitude revision, the second agency arriving and merging, and 400 unrelated events. The panel
closes on exactly one thing, eviction, because then the event is genuinely gone.

---

## Hit testing is geographic first, and that came out of the perf budget

The obvious implementation projects every drawn event and compares screen distances, which needs the
layer to remember what it drew. That list cost **40% of the fifty-thousand-event update budget**:
6.9ms became 8.8–10.8ms from a single `keys[n] = quake.key` in the hot loop. A typed-array write is
a store; a reference write is a store plus a garbage-collector write barrier.

So the pointer becomes a longitude and latitude, the first pass is a great-circle distance with no
projection at all, and only the eight nearest candidates get projected to settle it in pixels.
Pixels still decide, because foreshortening near the limb makes angles and screen distance disagree.

**The budget caught this, which is the point of having one.** It also exposed a flaw in the gate
itself: the same measurement read 6.9ms alone and 15.3ms with five other test files running. A gate
that passes or fails depending on what else is on the machine is worse than no gate, so files now
run one at a time. The suite takes under a second, so it costs nothing. Three consecutive full runs
now read 8.8, 7.1 and 9.1ms.

---

## Hue got into the chrome through a user-agent default

The magnitude slider rendered with a saturated blue thumb, because `accent-color` defaults to the
platform highlight. The one interactive control in the rail was drawing a system hue directly
beside the data ramp, which is precisely the confusion the two-palette rule exists to prevent.

Nobody decided this. It is worth recording because it is how hue will try to get in again: not
through a choice, but through a default nobody overrode.

The first fix broke the track instead, by grouping `::-webkit-slider-runnable-track` with
`::-moz-range-track` in one selector list. A selector list containing a pseudo-element the engine
does not recognise invalidates the whole rule, so neither browser applied it and a white thumb
floated on nothing. Split, never grouped.

---

## Two things that looked like bugs and were not

**Regions read "none in this window" while 21 events sat inside the box.** A full reload fixed it
with no code change: React Fast Refresh had preserved a `useMemo` result across a module edit.
A dev-only artifact, and worth not "fixing" something that is not broken.

**Markers render as crescents in dense margins.** Checked rather than assumed: 149 of 228 events had
a neighbour within 40km, so it is overlap under normal blending, not a shader fault.

---

## A push source with no history made the headline story invisible

On a cold load the rail read `USGS 227` beside `EMSC 0`, and corroboration was zero. That is correct
behaviour for a socket, which reports what changes from the moment you connect, and it meant the
thing this project is actually about could not be seen until you left the tab open long enough for
an earthquake to happen.

EMSC publishes an FDSN catalogue that is keyless and returns `access-control-allow-origin: *`, so
one request on connect covers the same 24 hours USGS seeds: 600 events in 327kB, no proxy, and the
Worker-free deployment survives. **Corroboration on a cold load went from 0 to 51.**

The seed is fired alongside the connection, never awaited, and its failure is not reported as a
source failure. The socket is the source; the catalogue is a head start, and telling somebody a
working feed is broken because an optional extra request did not land would be the wrong kind of
honest.

The rail now shows the whole arithmetic rather than a total: 225 USGS readings, 600 EMSC readings,
774 distinct events, 51 reported by both. Deduplication is named, not hidden.

---

## Markers hold their size against zoom, not against the viewport

Constant pixel size across zoom is right: zooming into a dense margin should separate events rather
than magnify them along with everything else.

Constant size across *viewports* is wrong, and the tweet-size test proved it. At 600px the globe is
110 pixels across, a magnitude 2 marker was 9 of them, and 775 events covered the planet in
overlapping discs with the coastlines gone. Markers now scale against the globe's radius at the
framing shot, so the size changes with the window and never while somebody is zooming.

The hit test uses the same formula and the same scale. If those two drift apart, the pointer stops
agreeing with the picture, which is the class of bug people describe as "it feels off".

---

## One entrance, then nothing

The globe starts 42 degrees back and slightly further out, and springs to the framing shot in about
a second. The value is entirely in the stopping: a camera that visibly settles is what tells a
viewer that everything moving afterwards belongs to the data.

Under `prefers-reduced-motion` the entrance is **skipped, not shortened**. A brief version of a
motion somebody asked not to see is still the motion.

---

## The accessible feed is the product, not an affordance on it

The canvas is `aria-hidden`, so for a screen reader the list *is* First Motion. That framing decided
everything about it: it carries the same information rather than a summary, it is ordered the way
the globe is thinking, and selecting in it selects everywhere.

**Ordered by recency, not by position.** Arrow-keying around a sphere spatially is disorienting even
when you can see it. "The next most recent earthquake" is a sentence anybody can follow.

**One tab stop, then arrows.** Tabbing through several hundred earthquakes to reach the filters
below would be its own accessibility failure.

**Visually hidden until focused, then visible.** A sighted keyboard user gets the same list rather
than tabbing into something they cannot see, and it costs one `focus-within`. `display: none` and
`visibility: hidden` both remove an element from the accessibility tree, so the clip technique is
not a stylistic choice.

**The live region is gated by magnitude, defaulting high.** A busy feed delivers hundreds of events
an hour and announcing all of them floods a screen reader until the person closes the page. Silence
that can be lowered is recoverable; an unusable page is not. The threshold and the colourblind ramp
both persist, because re-choosing an accessibility setting every visit is its own barrier.

**Gate met, with the canvas hidden:** 60 items, one tab stop, arrows move, activation opens the
detail panel, Escape closes it, `aria-current` marks the pinned event.

### React state is not a keyboard cursor

Three ArrowDown presses moved the focus one position. Each synchronous keypress read the same stale
`cursor`, because state does not update until the next render, and a key repeat is precisely that:
several events inside one frame. The handler now acts on a ref; the state exists only to drive
`tabIndex`.

---

## The reduced-motion test failed, and it was right to

`prefers-reduced-motion` had been written since step 3 and never observed, because it cannot be set
from inside the page. Every previous verification was reading the code and believing it.

The first browser test of it failed, and chasing why turned up two separate things.

**`test.use({ reducedMotion: "reduce" })` never reached the page.** Inside a block named "with
reduced motion", `matchMedia` reported `false`. The behavioural assertions had been passing anyway,
which is the worst available outcome: a green test making a claim about the *normal* path while
wearing the name of the reduced one. The context is now built explicitly, and the emulation is
asserted before anything else, so the test cannot pass for the wrong reason again.

**The spring overshot its destination, by an amount that varied with frame rate.** Measured at
145.6, 146.3, 149.9 and 160.5 degrees against a target of 145. Varying with frame rate is the
signature of an integrator rather than of a physics choice: semi-implicit Euler on a stiffness-100
spring is only stable while `stiffness * dt^2` stays small, and the 50ms frame clamp is not small
enough. So a slow machine got the bounce that critical damping was chosen to prevent.

The flight is now integrated in fixed 1/120s slices, which makes it identical at 15fps and 120fps
and means a reset takes the same second everywhere. A test asserts the entrance settles within
0.001 degrees of the framing shot.

Worth keeping: **the reduced-motion path itself was correct all along.** The test that failed found
a bug in the *other* path, and would never have been written if the setting had been left as a
claim.

---

## Five browser tests, and they stay out of CI

Everything decidable from pure logic already is: association, eviction, filters, the front-spawning
rule, the update budget. What is left for a browser is the handful of claims that only exist once
WebGL, real CSS and a real event loop are involved.

They are **not in CI**, for the same reason the live-API tests are not: `waitForData` waits on two
real agencies, so a quiet planet or an agency doing maintenance would fail the build for reasons
that are not the code's fault. Run with `pnpm test:e2e`.

**This is a known gap, not a decision I am happy with.** Routing both feeds to the committed
fixtures would make them deterministic and CI-able, and it is the obvious next improvement.

---

## The banned list is a test, not a checklist

Phase C in PLAN.md is a visual audit, and an audit performed once is worth very little because
everything it checks can come back the next afternoon. Two rules had already been broken by accident
during this build, and neither was broken by a decision: the slider's blue thumb arrived through a
`accent-color` default, and a dense cluster clipped to pure white under additive blending. Both were
caught by looking. Neither would have been caught twice.

So the rules that can be assertions are assertions, across all three breakpoints: **no chrome
element paints a hue, nothing overflows sideways, every updating number has tabular figures, nothing
is pure black, and the colourblind ramp survives a reload.** The three rules that genuinely need
eyes are named in the file rather than pretended away.

### The first version of the audit failed on the palette it was written to protect

It measured HSV saturation, and `Deck` is `#0D1420`: channels differing by 19 out of 255, which
relative saturation calls 0.59 because the colour is nearly black. Every dark tint scores high that
way, so the test flagged the design's own chrome.

Absolute chroma is the measure that distinguishes a barely-tinted grey from a blue button. The whole
chrome palette sits at or below 37; a browser default accent is 255; the threshold is 55. **A test
that fails on correct code is worse than no test, because it teaches people to skip the suite.**

---

## A claim in DESIGN.md turned out to be false

It said neither ramp contains a neutral grey, so no data value could be mistaken for chrome.
Measuring the stops killed it: Cividis's midpoint `#7D8E92` has a channel spread of **21**, less
chromatic than `Instrument Dim` at 34 and `Coastline` at 37. Cividis is perceptually uniform for
deuteranopia by construction and a near-neutral midpoint is part of how it gets there, so the stop
cannot simply be swapped.

What actually separates data from chrome in colourblind mode is **position, not chroma**: everything
inside the canvas is data, everything outside it is chrome, and no element of either kind crosses
that boundary. That is the stronger guarantee anyway, because it holds for any ramp added later.
Thermal's least chromatic stop is 57, so the original claim happens to hold there and was simply not
load-bearing.

DESIGN.md has been corrected rather than left to read well.

---

## A permalink names the event the way the agency does

The obvious implementation puts the store's key in the URL, and it would have been wrong in the way
that looks like working. Our key is `q` plus an arrival counter: stable for as long as one page is
open, and meaningless anywhere else, because the twelfth event to arrive on my machine is not the
twelfth on yours. A link carrying `q12` restores **a different earthquake**, and it does so
confidently.

So the fragment carries `usgs:us7000abcd`, the agency's own name for the event, which means the same
thing everywhere. The index that resolves it already existed for revision handling; it just was not
reachable from outside the store.

**Numbers are rounded to what the app actually knows.** Two decimal places of longitude is about
100 metres of camera position, and a longitude written to fourteen places in a shared URL is a claim
to sub-micron aim. Same rule as everything else on screen.

**A decoded fragment is untrusted input.** Not from hostility: people edit URLs, chat clients
truncate them, and an old link outlives the shape it was written against. Every field is optional,
longitude wraps, latitude and zoom and magnitude clamp, an unrecognised source or ramp is dropped,
and an event identifier that is not shaped like one is ignored. An empty source list is honoured
rather than treated as absent, because showing nothing is a real state.

### Two failures worth keeping

**A shared event may simply be gone.** The buffer is a rolling day, so a link shared yesterday names
an earthquake this page will never hold. Opening no panel silently would look like a broken link, so
the rail says why: *the event in this link is no longer in the window*. Same honesty as the window's
left edge.

**Pasting a link into an open tab did nothing.** Changing only the fragment does not reload, and the
permalink is read once at module load, so the address bar said one thing while the globe showed
another. A `hashchange` listener reloads, which is safe precisely because `replaceState` does not
fire `hashchange`: the app's own once-a-second rewrite cannot trigger it.

The link is rewritten in place rather than pushed. Every filter nudge and camera settle would
otherwise be a history entry, and Back would walk somebody through a hundred of them instead of
leaving the page.

---

## Clustering, and a collapsed marker that admits it

**781 events become 105 markers zoomed out, 569 zoomed in.** The crescent problem is gone: markers
along the Ring of Fire are circles again rather than overlapping arcs.

Binned on a longitude/latitude grid rather than merged by distance. Distance-based clustering would
group better and is the wrong trade here: a grid is one O(n) pass, and it is **stable frame to
frame**, where distance-based membership flips as the camera moves and the markers shimmer.
Stability matters more than optimal grouping for something being watched rather than analysed.

Longitude cells widen by `1/cos(lat)`, clamped at 8. Without the widening a cell near the Aleutians
covers a fraction of the ground an equatorial one does, and the far north stops clustering at
exactly the latitude where USGS reports most densely. Without the clamp, `1/cos` diverges and one
cell swallows a hemisphere.

**A cluster carries the largest event in its cell, not the first.** The fill still has to mean a
magnitude, and the only magnitude a collapsed marker can honestly claim is the biggest thing it
stands in front of. Understating it hides the event a viewer most needs to see.

**And it wears a chrome ring.** Radius already means magnitude and hue already means magnitude, so
neither was available to say "this stands for several". The ring is `Instrument`, which is exactly
right under the two-palette rule: the fill is data speaking, the ring is the interface admitting it
folded something up. Without it a cluster is indistinguishable from a single event, which is hiding
data rather than tidying it.

### The budget was re-measured, and the measurement itself was wrong

DESIGN.md requires a re-measure after a render-path change. Clustered: **6.2ms for 50,000 events**,
against 6.8ms unclustered and a 12ms budget, with zero heap growth.

Getting there exposed a flaw in the harness. The same unclustered 50,000-event sync measured
**14.99ms in one test and 8.89ms in the very next test of the same file**, on identical work. A gate
reporting a 68% swing on unchanged code cannot tell a regression from a busy machine, and single-file
execution had already removed the obvious interference.

It measured the median. For a deterministic CPU-bound operation the **fastest** observed run is the
honest estimate: every slower sample is the code plus something else, and the something else is
never the thing under test. Scheduler slices, GC pauses and frequency dips can only add. Three
consecutive runs now read 6.26, 6.45 and 6.61ms.

Fastest-of-40 fixes sampling noise and not sustained contention, which is a different thing and worth
knowing about before it wastes somebody's afternoon. The gate failed at **13.96ms** immediately after
a Playwright run, with eight chromium processes still resident; the same commit measured **7.65ms** on
a quiet machine minutes later. Nothing had changed. Forty samples taken during sustained load are
forty loaded samples, so the minimum rescues nothing. Making this portable would mean expressing the
budget as a ratio against a calibration workload measured in the same process, which is the right fix
and is not done. Until it is: run the perf gate on a machine that is not also running a browser.

---

## The interface was bad, and the measurements said why

Told bluntly that the UI was bad, I measured rather than argued. Three numbers settled it:

- **48% of the rail was empty.** Not minimal: unfinished.
- **8.5px was the most common type size in the whole interface.** Instrument type is small because
  the panel is dense. This panel was half air. Small plus empty is not restraint, it is nothing.
- **There was no legend.** The product encodes magnitude in hue, the two-palette rule exists to
  protect that encoding, three documents argue about which ramp to use, and nothing on screen ever
  said what the colours meant.

The worst of it was not a taste problem. **The list of recent events already existed and was hidden
from sighted users.** The screen-reader experience carried strictly more information than anything a
person looking at the page could reach. That is an indefensible thing to have built, and it came
from treating accessibility as a parallel deliverable instead of as the same one.

So there is one list now, visible, still keyboard-navigable, still announcing through a live region,
with the same content in the same order for everybody. The rail is 3% empty. Labels are 10px and
rows are 12px. The legend exists and is built from the same table the shader samples, so it cannot
drift from the data.

**And the list was lying.** It was headed "newest first" and ordered by *arrival*, which is right
for eviction and wrong for a list: after the daily seed lands, arrival order is whatever order two
catalogues answered in, so it opened on events nineteen hours old. Sorted by origin time now.

Place names are case-normalised for display. USGS writes "72 km E of Petropavlovsk-Kamchatsky";
EMSC writes "OFF EAST COAST OF KAMCHATKA". Listed together the shouting one reads as an error. Case
is not content, and the screen reader gets the same normalised string, so nothing differs between
what is seen and what is heard.

### The design contract caught five regressions in the redesign

Which is exactly what it was built for, one phase earlier.

Three were the legend painting the data ramp outside the canvas. That is a **correct** exception and
it still had to be named: `data-ramp` excludes one marked element rather than loosening the rule,
because DESIGN.md's own principle is that an unstated exception becomes a precedent and the next one
is a coloured button.

One was a real layout bug: at tablet width the rail lies down into a strip, and the event list came
with it, pushing the content **98px past the viewport**. A row of columns each holding a scrolling
list is not a strip. The list now spans the strip's full width underneath it.

One was a stale test. It compared `M 2.9` in the list against `M 2.9` in the panel, and the list had
dropped the prefix. The data never changed. **A test that asserts formatting when it means to assert
identity fails on every redesign and teaches people that redesigns break tests**, so it compares the
number now.

---

## Cramped rows were a rule violation, not a taste problem

Told the list rows were cramped, I measured rather than nudged padding. The rows were **31px tall
against DESIGN.md section 7's own 44px minimum touch target**, and the place column was 167px, which
cut anything longer than "Flores Region, Indonesia".

Two lines fixed both: 51px rows, a 253px place column, **0 of 60 truncated** where names like "Near
N Coast Of Papua, Indonesia" had been cut mid-word, and room on the second line for the depth and
the reporting agencies, which previously required pinning the event to see at all. The rail went to
356px because the list is its main content now.

### The rule had been in the document since step 1 and nothing enforced it

So it became a test, and the test immediately found two more breaches nobody had mentioned: the
source filter buttons at 27px and the region rows at 31px. One complaint, three violations.

**And the first version of that test was itself wrong.** It asserted 44px at desktop width with a
mouse. DESIGN.md says *touch* targets. A mouse is precise and 44px buttons on a desktop rail are
chunky for no benefit, so enforcing it globally would have been the easy read of the rule and the
wrong one. The CSS is scoped to `pointer: coarse` and the test emulates a real coarse pointer,
asserting `matchMedia("(pointer: coarse)")` before asserting anything else, because a test that
cannot prove it is in the mode it claims to test is the reduced-motion mistake again.

---

## The thin panel was a content problem, not a width problem

Measured at **81% empty**: ten lines in a 360 by 1187 space. Widening it would have made a wider
empty panel. The cause was that it only ever said what one feed reported, and **only 50 of 786
events have two readings**, so on 94% of events the project's entire subject was invisible.

It now answers the questions somebody pinning an earthquake actually has, all from data already
held: depth with its seismological class (shallow, intermediate, deep at the conventional 70km and
300km boundaries, because that changes what an earthquake *is*), what else has happened within
150km, the disagreement stated in units a person thinks in, and two buttons.

**The nearby count is the best thing on the panel.** A magnitude 3 alone is a magnitude 3; the same
event reading *"339 other events in this window, the largest M 5.4"* is one tremor in a swarm. The
data was always there and nothing ever asked it.

### The permalink had no way to be copied

Built in phase D, and for a whole phase the URL updated silently while nothing on screen suggested
it was worth copying. **A feature nobody can find is not shipped.** There is a Copy link button now.

### The heading contradicted the numbers under it

It read "The two agencies disagree" above `0.0 km apart`, `0.0 s apart`, `same magnitude`. Not a
wording nit: agreement is the *common* case, since the measurement across 50 real matched pairs put
the median separation at 0.0 km and 0.1 seconds, so the panel was calling almost every corroborated
event a disagreement.

The heading is now neutral and the sentence follows the data: *"They agree to the precision they
publish"* or *"They place it 6.5 km and 1.6 s apart"*. Writing the caption before looking at the
distribution is the same mistake as setting the association windows by reasoning.

---

## The legend and the magnitude filter were the same control

The rail had three control idioms doing two jobs, arranged by when each was written rather than by
what each does: bordered chips, borderless rows, and two bare sliders that looked identical while
one filtered the globe and the other set a screen-reader threshold.

The fix that mattered was noticing the legend and the filter were always about the same quantity.
One said what the colours mean, the other which of them to draw. **The slider now runs along the
ramp**: the track is the scale, the thumb is the threshold, and the excluded range is dimmed in
place rather than cut off, because a legend that changes length when you filter is no longer a
scale. Neither half needs a label explaining the other, and a whole block left the rail.

Everything else followed from grouping by function:

- **The colourblind ramp toggle moved to the header.** It sat with the source filters and answers a
  different question: sources are "what is on the globe", the ramp is "how is it drawn". Display
  settings belong with the other display readouts.
- **One row, used twice.** Regions and recent events are the same gesture, click a thing and go to
  it, so they are the same row. Two idioms total now: chips for toggles, rows for lists.
- **The announce threshold went into a `details`.** Two identical sliders stacked above each other
  read as one control with a duplicate. It is a setting almost nobody changes, and the people it
  matters to reach it by keyboard either way.

### Adding one button broke the header at every width

The right-hand group carried `whitespace-nowrap`, so the new toggle pushed the header **120px past a
phone viewport and 42px past a tablet**. Nowrap does not shrink, it overflows. The controls now stay
and the two informational labels drop as room runs out, because a toggle is something to press and
"wavefront ×20" is something to read.

### The touch-target rule named places instead of naming the thing

It read `.zone-rail button, .zone-panel button`: a list of the places that happened to have buttons
the day it was written. The header toggle and the new `summary` were added later and came in at 27px
and 17px on a phone, and the rule sailed past both. It applies to `button, summary, a[href]` now.

That is the same failure as the four other rules in this log that were true in a document and
enforced nowhere. A rule scoped to today's markup expires quietly the first time somebody adds a
control.

---

## Markers were sliced flat near the limb

Reported as dots being cut off at the bottom while orbiting. Reproduced by putting the Indonesian
margin low on the globe: markers near the horizon rendered as D shapes with a clean straight edge.

**A point sprite is rasterised as a screen-aligned square, and the whole square carries the single
depth of its centre vertex. The sphere behind it does not.** Near the limb the surface curves away
steeply, so pixels a few across from a marker's centre sit in front of an ocean surface much nearer
the camera than the marker's own depth. Those fragments fail the depth test and vanish. The
survivors end exactly where the two depths cross, which is a straight line through the dot.

The fix is to stop depth-testing the data layers at all. The shader already discards the far
hemisphere with `vFacing`, which asks the right question about a curved surface, so the depth test
was never doing useful work here and was only adding the artefact. The wavefront rings had the same
latent bug and got the same fix.

This is the land fill's problem arrived at from the opposite direction: there, geometry chorded
*inside* the sphere and the ocean poked through it; here, a flat sprite carried one depth across a
region where the sphere's depth varied. Both are the same mistake, which is asking a depth buffer to
adjudicate between a flat thing and a curved one.

---

## The entrance is the last day, played in

The wavefront is the signature and almost nobody ever saw one. Events arrive every few minutes, so a
visitor who looks for ten seconds sees a static scatter and none of the motion the design is built
around, while the app holds a complete day of history and draws all of it at once with its time
dimension unused.

The entrance now plays that day: events appear on their own timestamps, anything above M4.5 sends
out a front as it lands, the counter climbs to the total and the rail shows the replayed clock. Seven
seconds. Measured across a run: 47 events at 1s, 340 at 1.75s, 789 at 5.5s, with 22 fronts in flight.

The reveal is a *filter*, not a rewrite: `sync` takes a `revealUntil` and holds back anything later.
It is deliberately not a field on `Filters`, because a filter is a choice the viewer made and belongs
in the permalink, while this is a few seconds of staging nobody should be able to link to.

**Eased, not linear.** A linear sweep spends as long on the quiet hours as on a swarm, so it opens
slowly and blurs through the interesting part. Front-loading fills the globe fast and lands the last
events at roughly the speed real ones will.

### Three bugs, and the second was already live

**It ran at 12 seconds instead of 7.** It was advancing on the frame delta, which is clamped at 50ms
so a backgrounded tab does not lurch when it wakes. Under that clamp a slow frame rate makes playback
run at a fraction of real time. It uses unclamped wall clock now; the camera keeps the clamp.

**`seeding` was being spent before any event existed.** It meant "the first announcement", and
announcements also fire on status changes, so a source going live reliably beat its own first batch.
The seed then arrived looking like ordinary live traffic. That was **already wrong before the replay
existed**: it meant the daily seed's 227 events each got a wavefront instead of one between them,
which is the fireworks display `frontsFor` was written to prevent. It now means "the first
announcement carrying events", and a test pins it.

**It flashed the whole day before playing it.** The sync ran before the replay was created, so one
frame painted the ending and the replay then wiped and refilled it. The replay is decided before
anything is drawn.

### The counter was counting the wrong thing

It reported what the layer drew, which clustering collapses: a day of 789 events counted up to 105
under a heading reading EVENTS. Markers and events answer different questions and only one of them
matches the label. It accumulates events as the replay crosses them now, in the same pass that spawns
the fronts.

---

## The globe was invisible, measured

Land against ocean was **1.13:1**. That is not restraint, it is invisibility: the continents were a
suggestion and the coastline barely closed them.

Every value is bounded above by the darkest stop of the data ramp, because chrome brighter than the
dimmest earthquake starts competing with the thing it is a backdrop for. Land went to `#1E293F`,
which is 1.31:1 against the ocean and still **1.57x darker than the ramp's floor**. The coastline
went further, to `#31405D`, because definition comes from edges: brightening a 1px line adds
crispness, while brightening the fill puts a large pale shape on screen and pulls the eye off the
data. The graticule kept the old dimmer value and is now genuinely behind the land, which is what
scaffolding should be.

---

## Depth took the one channel that was left

Hue means magnitude and radius means magnitude. Inventing a second hue would break the rule the
whole palette is built on, so depth uses shape: solid disc for shallow, ring for deep, and a hole
opening between. The outer edge never moves.

It earns its place because depth changes what an earthquake is, and because a subduction margin now
draws its own cross-section: solid dots at the trench giving way to rings inland, which is the
Wadati-Benioff zone appearing out of data that was already loaded. In the current buffer that is 739
shallow, 49 intermediate and 3 deep, so it reads as a minority of markers rather than as noise.

**A missing depth draws as shallow.** Depth is genuinely optional in both feeds. Neither shape is
neutral, so the tie goes to the overwhelmingly more common case, and the detail panel still says
"not given" rather than a number.

**A cluster keeps the largest event's depth**, not an average. An averaged hole would belong to no
earthquake in the cell.

And the legend gained a row, because an encoding nobody can read is decoration. This one is
especially easy to mistake for a rendering artefact: a marker with a hole in it looks like a bug
until something says otherwise.

### One self-inflicted wound

The shader is a template literal, and I wrote a comment inside it using backticks around a variable
name. That ended the string mid-comment and typechecked as a syntax error twenty lines further down,
in code that was fine.

---

## The earthquakes were tracing a line nothing on screen drew

Every screenshot of this app shows the same thing: a chain of dots down the west coast of South
America, an arc through Indonesia, a hook around Japan. The globe rendered that faithfully and
explained none of it. Without the boundaries drawn, the Ring of Fire reads as a coincidence in the
data rather than the edge of a plate, and a visualization that shows a pattern while withholding its
cause is decoration.

PB2002 (Bird, 2003) is public domain and is the standard digital boundary model. Raw it is 6,292
vertices and 221KB, which is more than the entire coastline. Douglas-Peucker at 0.15 degrees takes it
to 1,872 vertices and **9.4KB gzipped**: 0.15 degrees is about 17km, and the boundaries themselves
are located to roughly that, so the simplification discards precision the source never had.

The geometry chunk went from 26.5KB to **36.8KB against a 40KB budget**. Recorded rather than
quietly absorbed, because 3.2KB of headroom is a different situation from 13.5KB and the next person
to add a layer needs to know that before they start.

Two things about drawing them were wrong on the first pass.

The comment claimed the boundaries go *under* the land. They do not: the land is opaque, the plates
are transparent, so three.js draws the plates over it regardless of render order. That is also the
right way round, and the reason is that the boundaries that matter most on land are the Himalayan
front, the San Andreas and the North Anatolian, all of which would have been buried.

They were also drawn in the coastline's colour at 62%, which made them nearly invisible in the
screenshot. A line you cannot see cannot explain the dots sitting on it. They are now brighter than
the coastline, which is a deliberate ranking: a coastline is orientation and tells you where you are
looking, a plate boundary is the explanation and tells you why the earthquakes are in a line. In a
seismic map the explanation should not be the fainter mark.

## A permalink carried three things and the tests checked two

Framing the screenshot for the boundaries meant opening `#at=118,-6,3`, and the globe opened on the
default view instead. The camera in every shared link this app has ever produced was being discarded.

`enter()` named the default framing as its destination. The permalink aims the camera during setup
and the entrance runs after the first draw, so the entrance overwrote it, every time. Nothing threw.
The entrance looked exactly as designed, because it was doing exactly what it said.

The existing test, "a shared link restores the view on a fresh page", pins an event, flips the ramp,
copies the link and asserts both come back. It never asserted the camera, so the one part of the
permalink that was broken was the one part nobody looked at. The fix is four lines; the lesson is
that a test named after a whole feature will be trusted for the whole feature, and this one covered
two thirds of it.

The entrance now flies to wherever the camera is already aimed, so it works for the default framing
and for a link without knowing which it has. The new test was checked against the old behaviour and
fails on it.

## The globe cannot show when, and the window filter had no control

Two problems that turned out to be one. The globe draws an event four minutes old exactly like one
nineteen hours old, so the single thing a seismic sequence *is*, a shape in time, was the one thing
the app could not show. Separately, `windowMs` was enforced in `matches`, encoded in permalinks and
clamped on the way back in, and nothing anywhere could change it: a link could carry `w=6` and no
one could produce one.

A 24-hour histogram answers both. It is the same idea as the magnitude filter, where the ramp is the
legend and the thumb is the threshold: here the day is the legend and the thumb is the left edge of
the window. Excluded hours dim in place rather than disappearing, so the day stays whole.

The slider's value is the **left edge in hours-ago**, not the length. A value counting hours would
have to run backwards for the thumb to sit where the window starts, and the last control here that
inverted a direction to be clever took three attempts to get right.

Bars are square-rooted. Counts across a day run from zero to several hundred once a sequence starts,
and linear height flattens the other twenty-three hours into a line: the strip would show the swarm
and hide the day around it. The peak is printed as a number beside the bars, so the one quantity
worth knowing exactly is read rather than estimated off a bar.

## The strip came up entirely grey, and it was right

Every hour rendered as "not observed" on a page holding a full day. The histogram was reading
`stats.since`, the earliest *arrival* still held, and both feeds seed a whole day in their first
request: every event in a complete buffer arrives at page open.

Which meant the rail had been printing "since 00:11 · still filling" permanently, over a buffer that
was already full. That disclaimer was written when the seed fetched an hour. The seed became daily
later and the rule underneath it was never revisited, so it went from a careful piece of honesty to
a line that was always on. A disclaimer that never turns off is not read.

The fix separates coverage from arrival: the feed records `coveredSince` when the first delivery
lands, at 24 hours back, and `windowStart` and `windowLabel` read that instead. One optimism worth
naming, and it is in the source comment: EMSC's seed is capped at 600 events, so on an exceptionally
busy day its half of the day is truncated. USGS `all_day` has no cap.

A unit test asserted the old behaviour, that no data means the window is complete. Under arrival
semantics that was defensible: nothing held is nothing to contradict the window. Under coverage
semantics it is the worst case in the set, an empty page reporting a complete day.

## The biggest number in the rail ignored every filter

Found by dragging the new window control and watching nothing happen. The headline was
`stats.quakes`, the held total. Magnitude, sources and the window all changed the globe and none of
them changed the number sitting above it.

The comment directly above that number already said the right thing. It was written about the replay,
where the held total sat unchanged while the globe filled beneath it, and it calls that "a true
number describing something other than the picture next to it". The same sentence was permanently
true of the filters and nobody had turned it around.

It is now derived from the histogram bars rather than counted again: the strip has already applied
magnitude and source to every event in the buffer and split them by hour, so summing the hours inside
the window applies exactly the predicate `matches` does, with no second walk. On a real load it
moved the headline from 789 to 546, which is how much of the buffer was never on the globe.

Two things fell out of making the counts agree. Events dated slightly in the future, which happens
because agencies and browsers disagree about the clock by a second or two, were being dropped by the
histogram while the globe drew them; they now land in the current hour. And the first version of the
browser test read its baseline mid-seed, so narrowing the window to four hours produced a *larger*
number and the test blamed the feature: a baseline taken from a moving total is not a baseline.

## Two labels, one sentence

The rail printed "last 6 hours" under the headline and again under the strip, from the same number.
Playwright found it as a strict-mode violation, which is a test failing for a reason better than the
one it was written for. Nothing on screen told you which of the two you had just changed. The strip
keeps the axis and the thumb, the headline keeps the count and names the window, and the slider
carries it for assistive tech in `aria-valuetext`.

## Two views that each knew half the answer

The strip knows when things happened, the globe knows where, and neither could be asked the other's
question. The Flores Sea reads as one bright blob whether its four hundred events spread evenly over
a day or landed inside ninety minutes, and the strip could show that shape without saying which dots
on the globe it belonged to.

Holding the pointer on an hour now dims everything outside it. Opacity and nothing else: hue is
magnitude, size is magnitude, the hole is depth, and this is not a fourth encoding but a transient
answer that ends when the pointer leaves. Dimming rather than hiding, at 0.15 rather than 0, for the
same reason both filter tracks dim: twenty-eight events mean very little without the day around them,
and the point of holding an hour is to see where in the pattern it falls.

Three things about it were not obvious.

**The hour has to be resolved on the CPU.** The natural implementation is an age attribute and a
comparison in the shader, and it is wrong here: a clustered marker stands for every event in its
cell and those events do not share an hour, so the representative's age would dim a cell that
genuinely contains the hovered hour. "Does this marker hold anything from that hour" can only be
answered where the members are still visible, which is inside the sync loop. That puts two
comparisons and a buffer write on the hot path, so it is gated rather than assumed: 7.081ms against
a 12ms budget at fifty thousand events, up from 6.537ms.

**Both interactions live on one element.** The slider already covers the bars, so reading hover from
the individual bars would mean the slider swallowing every pointer event meant for them. It carries
both: dragging sets the window, moving across it holds an hour. Quantised to whole hours, so the
globe re-syncs once per bar crossed rather than once per pixel.

**The wavefronts had to come with it.** The first version dimmed the markers only, and holding an
hour five hours old left the brightest things on screen, three full-strength rings, belonging to the
current one. The globe faded to ghosts around an animation announcing the opposite of what the
pointer was asking about.

Two smaller corrections. The held column was marked with a lifted backdrop, which the bar itself
covered: the only visible part was the few pixels of headroom above a peak, so it now takes a chrome
tick at the top of the column. And the readout printed a clock time, 05:51, which is a bucket
boundary nobody chose rather than a fact about the hour; the buckets are anchored to now, so the
readout is relative like the axis either side of it.

## The number changed and the app said nothing

An agency's first magnitude is automatic. A reviewed one arrives later and is often different: an
initial M6.1 becoming M6.4 within the hour is ordinary. The store handled this correctly and silently.
`existing.readings[at] = reading` replaced the old reading outright, so the number on screen changed,
the marker resized and recoloured, and nothing anywhere said it had happened. DESIGN.md already
requires a magnitude to carry its scale because a bare number implies a precision that does not exist;
a revised number with no history implies a certainty that does not exist either.

Three fields rather than a trail: what the agency first said, what it says now, and how many times it
has changed. The reason revisions replace instead of appending is that a busy event updated all
afternoon would grow an unbounded array inside a bounded store, and that reason still holds. The
middle of a trail also answers nothing anybody asks.

**The detail that decides whether any of this means anything:** both USGS feeds re-serve every event
they hold, so the replace branch runs on every poll for every event whether anything moved or not.
Counting arrivals there would have every earthquake on screen claiming twenty revisions by evening.
Only a changed magnitude counts, and a redelivery of an already-revised reading keeps the history
rather than dropping it.

The `revised` stat is per event, and the reason is a bug the tests caught before it shipped. It first
incremented per reading while eviction refunded per event, so an earthquake both agencies revised
added two and gave one back: a counter that drifts upward for as long as the page is open, invisible
in any single case. There is now a churn test that runs two hundred doubly-revised events through a
ten-slot store and asserts the count cannot exceed the events held.

Surfaced in three places, which is one requirement rather than three features. The panel says
"USGS first said 6.1, now 6.4" directly under the magnitude, because it is a statement about that
number and nowhere else would connect them. The header counts them, and only once there is one to
count. And the list rows say "revised", because a count in the header with nothing to click is a
statistic about an invisible set: you learn that three magnitudes changed and cannot find one of them.

The row needs no `aria-label` for that word to be spoken. It is a button without one, so its
accessible name is computed from its content, and the test asserts the accessible name rather than the
text to prove that rather than assume it. The live-region announcement does carry the values, because
a row can be pinned to find out what changed and an announcement has already gone by.

## The first browser test that routes a feed instead of waiting on one

Revisions are real and rare. An agency reviewing a magnitude an hour later is not something a test can
wait for, so the panel reporting it would have shipped having never been looked at.

USGS's parser reads each feature independently, which means one payload carrying the same identifier
twice with two different magnitudes exercises exactly the ingest path a real revision takes. An hour
of waiting compressed into one response, with EMSC aborted and the hourly feed emptied so nothing else
can appear.

This is also the shape of the fix for the open item above about browser tests staying out of CI: the
reason they cannot run there is that they wait on two live agencies, and this one does not wait on
either. It routes one endpoint rather than building the fixture harness the rest of them would need,
so it is a demonstration and not the fix.

## Open, and honestly so

Written last, and kept accurate rather than kept short.

- **Aftershocks can be swallowed.** Association uses time and distance, and the two populations
  genuinely overlap: real matched pairs reach 16.7 seconds and 135km, which is squarely inside
  aftershock territory. No threshold separates them without dropping genuine matches. The detail
  panel lists every merged reading so a wrong merge is visible, which is the difference between a
  limitation and a lie, but it is a real limitation and not a rare one during a sequence.

- **Browser tests are not in CI.** They wait on two real agencies, so a quiet planet or an agency
  doing maintenance would fail the build for reasons that are not the code's fault. Routing both
  feeds to the committed fixtures would make them deterministic and CI-able. One test now does
  exactly that for one endpoint, which shows the shape of the fix without being it.

- **Both gates are sensitive to a loaded machine, and neither says so when it fails.** The perf
  budget failed at 13.96ms against 7.65ms quiet, with browsers still resident. Two browser tests
  failed in a full run that took 6.7 minutes and passed in one that took 3.6. In both cases a real
  failure and a busy laptop are indistinguishable from the output, which is the property a gate is
  supposed to not have. A ratio against a calibration workload would fix the perf side; the browser
  side wants the fixtures above, so that waiting on a live feed is not a timeout waiting to happen.

- **GPU frame time has never been measured with a profiler.** The CPU budget is gated and recorded;
  the rendering side has only ever been judged by looking at it. Nothing has suggested a problem,
  and "nothing has suggested a problem" is not a measurement.

- **The window cannot go back before the page opened.** No backend, so time scrubbing was rejected
  rather than shipped as a worse version of itself.

- **Dense sequences are legible but not readable.** 400 events in the Flores Sea still collapse to a
  handful of markers on the globe. The activity strip and the hour hover answer most of what was
  missing, that a sequence has a shape in time and that the shape belongs to specific dots, but both
  are hourly: nothing steps through a sequence event by event.

- **Holding an hour is pointer-only.** Hover has no keyboard or touch equivalent, so the link between
  the strip and the globe is an enhancement rather than a feature. The strip's actual job, selecting
  the window, is fully operable from the keyboard through the slider, and the accessible feed lists
  every event with its time; but a keyboard user cannot ask "which of these happened at 05:00" the
  way a pointer user can, and no amount of arrow-key cleverness would be discoverable enough to
  count.

- **No demo video.** The write-up asks for one and there is none, because recording it was not
  something this build could do.
