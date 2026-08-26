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

Fastest-of-40 fixes sampling noise and not sustained contention, which is a different thing. The gate
failed at **13.96ms** immediately after a Playwright run with eight chromium processes resident, and
again at **13.11ms** on another machine, against **6.8ms** quiet. Nothing had changed either time.
Forty samples taken during sustained load are forty loaded samples, so the minimum rescues nothing.

It now budgets a ratio. A fixed workload runs in the same process moments before the measurement and
the assertion is on `sync / reference`, so contention that inflates one inflates the other. The
reference does trigonometry into a typed array, deliberately shaped like the inner loop of `sync`: a
pure arithmetic loop would be CPU-bound where `sync` is partly memory-bound, and the ratio would drift
with cache pressure instead of holding still.

Measured rather than assumed. Quiet: 4.09, 4.14, 4.10. Eight saturated cores: 4.22, 4.29, while the
milliseconds went 6.53 to 7.28. Thresholds sit about 45% above quiet, which absorbs the drift actually
observed and still fails a regression that adds half again to the cost.

Not a complete fix, and worth saying so. The worst case seen was +82% in milliseconds with browsers
resident, which is memory pressure rather than CPU contention, and no same-process reference cancels
that. What the ratio buys is that ordinary background load stops looking like a regression.

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

Later shortened to 2.8 seconds and made the first of two clauses; see the opening entry near the end
of this file. What follows is why it exists at all.

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

## The first two seconds were a hole, and three.js was why

Measured on the production build, not the dev server, because dev-mode module loading inflates the
first number by 1.5 seconds and would have made this a false finding.

| | Before | After |
|---|---|---|
| Rail painted | 2091ms | **128ms** |
| Canvas painted | 2091ms | 1434ms |
| First list rows | 2781ms | 2062ms |
| Headline populated | 2932ms | 2201ms |

Nothing was slow. `App.tsx` imported `Globe`, which imports three.js, so the entry chunk could not
execute until 231KB gzipped had arrived and parsed. A `lazy()` boundary around the canvas drops that
to 60KB: React and the interface paint while three.js is still on the wire.

Worth being precise about what this does not fix. The globe still cannot draw before three.js parses,
so 1434ms is a floor set by the library. What changed is that the wait now happens behind a working
interface rather than a blank page.

## Four sentences nobody wrote

At 128ms the rail read `Events 0` above `nothing yet · still filling`. Two disclaimers stacked under
a number that meant nothing, composed by two independently reasonable branches: `windowLabel` returns
"nothing yet" for null coverage, and the caller appends "still filling" when coverage is incomplete.
Both correct, and nobody had read the sentence they made together.

Writing the test that locks it turned up three more of the same kind, all only visible in a state
that lasted two seconds:

- The activity strip reported "nothing yet" beside the new sentence, saying the same thing twice.
- Its caption explained that blocks are unobserved hours, at the moment when every hour was a block.
- The event list said **"No events match the current filters"**, blaming filters for a feed that had
  not answered. That one sends somebody to widen a filter that was never the problem.

Then the screenshot showed two more. "Waiting for the first events." was pinned 450px below the
heading it belonged to, because the list is `flex-1` and the message followed it. And the header
carried `0 USGS 0 EMSC 0 distinct 0 both`, which is the headline's problem four more times.

Six copy defects in one state, none of them a bug, none reachable by reading any single file. The
state is now a sentence, a legend, an empty strip and a globe with its geography already drawn.

## Two user-agent defaults, one of them ironic

`::selection` was unstyled, so dragging across a place name painted the browser's default saturated
blue: the most chromatic thing on screen, in the app whose central rule is that chrome carries no hue
and which fails a build over any element above chroma 55. The rule was enforced on elements and never
on pseudo-elements.

Scrollbars were unstyled too. Measured gutter width is 0px on macOS, where overlay scrollbars fade in
and out, which is exactly why it survived being looked at: on Windows and Linux Chrome it is a
permanent light channel down the darkest element on the page. Both are now asserted by the design
contract rather than fixed and forgotten.

## Hover, and one item I had counted wrong

Every button already had `cursor: pointer` and a 150ms colour transition. Three real gaps, of which
one turned out not to be:

- A source toggle in its **active** state had no hover rule at all, so the two most-pressed buttons in
  the rail stopped acknowledging the pointer once switched on, which reads as becoming disabled.
- Both sliders had `:active` thumb styles and nothing on approach. The magnitude thumb is 4px wide and
  the window thumb 3px, which is precisely where confirmation before committing matters.
- I had also listed the activity strip's bars. On implementing it, the column highlight and the
  changed readout *are* the hover feedback. What is actually missing there is discoverability, which
  is a different problem, and inventing an affordance for it would have been decoration.

## The panel materialised, and the fix I did not ship

The detail panel was `transition: all 0s, animation: none`, appearing in one frame on the interaction
that happens most.

The obvious fix is to animate the grid track so the globe slides instead of jumping. I did not, and
the reasons are worth keeping: the third column is `auto`, so animating it means giving it explicit
widths; the canvas then reflows every frame for the duration, re-rendering WebGL a dozen times; and
because React unmounts the panel on close, the exit would be the panel vanishing and *then* the space
closing, unless the panel is kept mounted through the transition with state that exists only to serve
an animation.

So the panel arrives on opacity and 10px of travel, and the layout still snaps. The stated problem was
that it materialised, and it no longer does. The globe's jump is a viewport being resized, which is
what it is.

## The held-hour cut

`setDim` wrote a uniform on redraw, so the planet cut between two brightness levels in one frame,
once entering the strip and once leaving. It is now eased over 130ms by the frame loop, which already
owns everything else that moves, with the fade driving the markers and the wavefronts from one value.
Under `prefers-reduced-motion` it steps straight to the target rather than easing briefly, on the same
reasoning as the entrance: a shortened version of a motion somebody asked not to see is still motion.

## The opening: the dots draw the lines

The old entrance was three things moving at once, and it filled the whole ten seconds: a camera
flying in from 40 degrees while zooming, a day of seismicity replaying at 20x for seven seconds, and
one wavefront. It was also, by then, partly redundant. The replay existed because nothing in the app
said when anything happened; the activity strip now answers that permanently and more precisely.

The app's one real insight is that earthquakes are not scattered, they trace plate edges. The
boundaries were drawn from the first frame, so a viewer saw a pattern already explained and read it as
a map. The opening now sequences it: the day lands, then the boundaries grow outward **from the
earthquakes**, nearest segments first. The dots draw the lines.

Growing from the events rather than fading in or wiping across, because a fade says nothing and a wipe
has a direction that means nothing. Growing from the dots is the claim the picture is making.

**Ordering plus a draw range, not a shader.** Reveal-by-threshold wants a per-vertex attribute and a
custom material on a line layer that otherwise needs neither. Sorting 2,479 segments once by squared
chord distance to the nearest event and then sliding `drawRange` gets the same picture out of code
that already exists. Squared chord, never an angle: monotonic in the angle and no inverse trig across
half a million pairs.

## Building it wrong twice, and one wasted detour

**The first version was too subtle to be a moment.** The boundaries are quiet chrome on purpose, so
dim lines appearing over 1.5 seconds is a detail, not a revelation. A second `LineSegments` sharing
the same buffer draws a brighter band at the growing end and settles behind itself, which is the same
information with the revelation visible. Two draw calls, no shader, and the band is just a second draw
range sliding along a buffer that is already sorted.

**Then I wasted a detour comparing screenshots.** Three frames looked like the reveal was running
*backwards*, so I went hunting for buffer corruption. It was not: a probe showed `drawRange` climbing
monotonically to 4,958 of 4,958. What had happened is that I was reading 1px lines at 0.9 opacity
across screenshots at different scales and reaching a different conclusion each time. The fix was to
stop looking and write the test that settles it, which asserts the reordered buffer holds exactly the
same multiset of segments as the original, so the settled picture is provably identical to the
unordered one. Two minutes of test against twenty of squinting.

One of those screenshots was also 320px tall because the viewport was 1100px wide, below the 1280
breakpoint, so the rail was stacked above the canvas and had taken the height. Verifying a desktop
layout in a tablet layout.

## Shortening the replay moved something it was tuned against

Seven seconds to 2.8, so the reveal has room. `REPLAY_FRONT_MIN_MAG` was picked at 4.5 to give roughly
three fronts a second across a day's fifteen to twenty-five M4.5+ events, and cutting the duration
without touching it doubled the rate to a firework. Raised to 5.0, where a day yields five to eight,
which restores the tempo the number was chosen for. A quiet day with nothing above 5.0 still gets the
single front every cold load fires.

That is the kind of coupling worth writing down: the constant was not wrong, its denominator moved.

**Not verified in a browser test.** The sequencing is eight lines in the frame loop and the draw range
is not reachable from the DOM, so locking it would mean exporting the scene for a test to poke at. The
ordering invariants are unit-tested and the sequence was checked by screenshot. Under
`prefers-reduced-motion` the reveal is skipped entirely and the boundaries are simply present, on the
same reasoning as the entrance: a shortened version of a motion somebody asked not to see is still
motion.

## The panel knew how many and how far, and never when

The last thing this app promised and did not deliver. It is written up as a limitation in three
documents: dense sequences are legible on the globe and not readable, because clustering collapses four
hundred events in the Flores Sea to a handful of markers.

The panel already found every neighbour within 150km and reported the count, the four largest and their
distances. It never reported a single time, which is the one thing that decides what a pinned event
actually *is*. An M4 with a larger event three hours behind it is an aftershock. The same M4 with
smaller ones after it is a mainshock. Every timestamp needed to tell those apart was already held.

So `findNearby` now also returns each neighbour as a signed offset from the pinned event, and the panel
draws one axis: time, with the pinned event fixed at its true position in chrome and every neighbour as
a tick coloured and sized by magnitude. Overlap is not a defect. Three hundred ticks piling into ninety
minutes is the shape of a swarm, and it is precisely what the globe cannot show.

Measured on real data: pinning one M2.6 in the Flores Sea gives **301 neighbours, 207 before and 94
after, spanning 12 hours before to 4.8 hours after**, with the largest at M4.9 arriving 1.1 hours after
it. That is a complete answer to "what am I looking at" out of data the app already had.

Two details worth keeping.

**Tick height uses the marker radius function, not the ramp position.** The first version scaled height
linearly against the ramp, which put a swarm of M2s and an M4.9 within seven pixels of each other:
the one comparison the strip exists to make. It now uses the same square root the globe uses for radius,
so height here and size there mean the magnitude the same way, and it stays absolute rather than
normalising to the local range. Normalising would read better and would make the same M4.9 tall in one
panel and short in another.

**The sentence states, it does not conclude.** "The largest nearby was M 4.9, 1.1h after it." Whether
that makes the pinned event a foreshock is the reader's call and depends on things no keyless feed
carries. The strip shows the shape; the reader draws the inference.

Known cost, not measured: `findNearby` is a full pass over the buffer and the panel re-renders once a
second with the clock, so a pinned event walks up to fifty thousand events every second and now builds
a three-hundred-element array while doing it. It was already doing the walk. Memoising it would freeze
the neighbour list while somebody watches a live sequence, which is the wrong trade for an unmeasured
cost.

## Four things a user found that the audit did not

Reported directly: the page scrolls vertically, the zoom is not smooth, there are no key hints, and
does this even support a keyboard. All four were real, and the UI/UX audit two entries up had declared
"nothing else in the brief needs work that I can find". It found what it went looking for.

### The page scrolled into 2,546px of void

Measured: `documentElement.scrollHeight` was **3,486px against an 820px viewport**, so the whole app
could be dragged off the top of the screen. Below the fold was empty.

The chase was longer than the fix. `body` and `.frame` both measured exactly viewport height, and the
event list *is* a correctly bounded 224px scroll container holding 2,828px of rows. Setting
`overflow: clip` on the list did not help. Neither did clipping the root, which is when the second
lesson landed: `overflow: hidden` is still programmatically scrollable, so the first version of the
test failed on a page a user could no longer actually move. Only `display: none` on the list made the
document collapse to viewport height, which named the culprit.

The fix is `contain: paint` on the list. A scroll container's content still reaches the document's
layout overflow; containment is the only thing that says "nothing in this box affects anything outside
it", which is exactly the claim that was false. The phone rail needed the same, being the box that
scrolls there.

The old test measured `scrollWidth` and had passed the whole time. The new one moves a real mouse
wheel and asserts `scrollY` is still zero, because that is the only question a user asks.

### The wheel was the one input bypassing the spring

`zoomAt` assigned `zoom` directly onto the camera, so a notch moved 14% in a single frame while every
`flyTo` in the app went through a critically damped spring sitting right there.

Measured per frame, before: `1.3021` from the first frame and every frame after. After:
`1.00, 1.03, 1.09, 1.14, 1.18, 1.22, 1.24, 1.26, 1.27, 1.28, 1.29, 1.293, 1.296, 1.298, 1.299, 1.300`.

The anchoring maths is unchanged and still solved against a real camera, just a hypothetical one: the
camera is moved to where it is heading, the correction is solved there, the result becomes the target,
and the visible camera is put back for the spring to carry.

**Compounding off the pending target, not the animated value.** Two quick notches must land on two
notches. Compounding off the current zoom is the natural way to write it and silently undershoots,
because the second notch is measured against a camera still in flight: it lands on 1.59 instead of
1.70. That is what the test asserts, and the mutation confirms it fails without it.

**Smoothness itself is not asserted, and I tried.** Frame counting cannot tell the two apart: Playwright
dispatches one notch as about eight wheel events, each wakes the loop for a frame either way, and both
implementations measure eight. Three versions of that test passed against a deliberately broken
implementation before I stopped and measured the ramp directly instead. A test that cannot fail is
worse than no test, because it reads as coverage.

### An accidental finding: the loop does stop, after 40 seconds

Chasing the frame counts turned up an "idle" rate of 15 frames a second. Not idle: every live arrival
fires a wavefront that animates for 15.7 seconds, and with two feeds delivering there is nearly always
one in flight. Watched for 40 seconds it does reach zero, so DESIGN.md's claim holds, but "the loop
stops when nothing is moving" means something closer to half a minute after the last earthquake than
the fraction of a second it implies. Tests that want a genuinely idle globe have to route the feeds.

### The globe had no keyboard control at all

Everything bound was Escape and the list's own arrows. A keyboard-only viewer could not move the camera
in any direction, at any zoom.

The canvas is `aria-hidden` and unfocusable on purpose, because the accessible feed is the interface for
a screen reader and the canvas is never it. That was read as covering the keyboard, and it does not: a
sighted person with no mouse is a different user with a different need.

Arrows orbit, `+` and `-` zoom, `0` resets, Shift moves further, and every one of them goes through the
same `aim` helper the wheel uses so a held key behaves like a scroll rather than a series of jumps. The
handler runs only while nothing is focused, which is one rule rather than a list of elements to keep in
step: naming regions instead of naming the thing is how the touch-target rule went wrong.

And they are written down now, in a row under the event list. Every one of those keys already worked
and none of them appeared anywhere on screen, which makes a documented shortcut a secret.

## Sweeping the categories I had never looked at

After missing four basic things, I stopped auditing what I had built and went through categories that
had never been checked at all. Five more defects, four of them in states the happy path never reaches.

### The failure state claimed a day it never fetched

With both seed requests dead and two stray socket pushes arriving, the rail read **"EVENTS 0, last 24
hours"**. A complete day claimed on the strength of two events it happened to be handed.

`coveredSince` was inferred from the first delivery that carried events, on the assumption that the
first delivery is the seed. It is not, when the seed fails. Coverage is now reported by whichever
source actually fetched a backlog, through a new `onSeeded` handler, and each source says how far back
its own fetch reaches: USGS's day feed has no result cap so it vouches for the whole day, and EMSC's is
capped at 600, so a full page vouches only as far as its oldest event. That also closes the caveat I
had written into the README rather than fixed.

This is the third version of this field. Earliest arrival said "still filling" forever; first delivery
claimed a day that was never fetched; a source's own report is the one that is actually knowable.

### A specified error state that was never built

DESIGN.md section 6: "A failing source degrades to a hairline notice in the rail naming the source and
the retry." `SourceStatus` has carried `{ kind: "failing", reason, retryAt }` since the first source
was written and nothing ever read it. The header said "one feed live" whether the other source was
still connecting or had been refused for ten minutes.

The rail now names it: "USGS is not answering: Failed to fetch. Retrying at 13:15." The raw reason is
kept rather than softened, because a friendlier sentence would hide which failure it was.

### Pinch was zooming the document

The canvas was `touch-action: auto`, so the browser claims a two-finger gesture before the pointer
events reach the pinch handler that has been in `controls.ts` since the first version. A one-finger
drag happened to work, which is why nobody noticed. Touch had no test coverage at all; it does now,
for both gestures.

### The boundaries never appeared on a load with no data

Found while generating a share image with the feeds stubbed out. The entrance reveal has an eight
second fallback for exactly this case, and the fallback set its flag without waking the render loop, so
the frame that reads the flag never ran. On a load where no feed answers, nothing else is moving, and
the plate boundaries stayed hidden permanently: the one load where geography is all there is to show.

### Every shared link previewed as a bare URL

The permalink is a headline feature of this app and it looked like nothing in every client it was
pasted into. There are Open Graph and Twitter tags now, and the preview image is captured from the app
itself by a script rather than drawn by hand.

**It deliberately has no earthquakes on it.** Real events would look better and would also be a lie: a
card is cached for days, so it would present one particular day's seismicity as if it were now, which
is sample data unlabelled. The globe with its coastlines and plate boundaries says what the instrument
is without making a claim about what is happening.

## Links were coming out as at=499.37

Found while diagnosing an unrelated test failure. The camera's longitude accumulates: the spring takes
the shortest way round, so crossing the date line adds or subtracts a whole turn and nothing ever takes
it off again. `decode` has normalised on the way in since it was written, so these links worked
perfectly and read like a bug to anyone who looked at one.

Normalised on encode rather than in the camera, deliberately. The shortest-path spring depends on `lon`
being continuous, and a permalink is the only place the number is read by a person.

## Two tests that were wrong, not two bugs

The suite finished with two failures and both were mine.

The arrival test routed both HTTP feeds dead and still saw an earthquake from Salta: EMSC pushes over a
WebSocket, and `page.route` never sees one. It stubs `window.WebSocket` now. Anything that wants a
genuinely quiet app has to kill the socket as well as the requests, which is easy to forget precisely
because the other feed is HTTP.

The keyboard test pressed a key while the entrance was still flying, so the nudge compounded off a
moving target. That is the behaviour the wheel fix deliberately introduced and it makes the destination
depend on when the key arrived. It waits for the entrance to land first.

## A second sweep, and three more

Focus order and reflow came back clean, which is worth recording as a negative result: eleven tab stops
in a sensible order, a visible 2px ring on every one of them, and no horizontal overflow at 320px, the
WCAG reflow width. Not everything checked is broken.

### Sixty-four wavefronts waiting behind a hidden tab

Announcements are coalesced through `requestAnimationFrame`, which a backgrounded tab suspends, so
arrivals pile up behind one pending callback and land together the moment somebody switches back. Up to
sixty-four fronts in a single frame: the same fireworks display announcing nothing that the seed rule
exists to prevent, arriving through a different door.

The comment at the top of the fronts test already said "every headless and backgrounded context
suspends it". The consequence for the arrival queue was never followed through, in a file written to
reason about exactly this.

An announcement now fires at most three fronts, choosing the largest and putting them back into arrival
order. Live traffic delivers one or two per announcement, so this changes nothing in normal running,
which is what makes it a safe rule rather than a tuning knob.

### The globe was a 153px sliver on a small laptop

The tablet band gave the rail an `auto` row and the canvas the remainder. At 900 by 700 the remainder
measured **153px, 22% of the viewport**: a globe reduced to a strip by the controls describing it.

Every screenshot of that band had been taken at 900 by 900 or taller, where the rail's height happens
not to matter. The canvas row is now `minmax(45dvh, 1fr)` and the rail scrolls in its band if that
leaves it short, which is the right way round: the subject gets a floor and the chrome yields.

The first attempt made the rail's row `minmax(0, auto)` so it could shrink. That is not a smaller row,
it is an overlapping one: the grid sized it to min-content, the rows collapsed, and the event list kept
its own `max-height` and spilled on top of the key hints. Four candidate fixes were measured before the
right one, and the one that worked was to stop shrinking the row and cap the rail instead, with the
list given a definite `height` rather than a `max-height`, because a maximum is not a floor and a
constrained grid will happily size a row below it.

45dvh, not 50: the header takes its own slice first, so 50 left the globe at 42% of a 640px screen.

Measured after: 47% at 900 by 700 against 22% before, and the test asserts a floor at five sizes rather
than at one comfortable one.

**The honest cost.** In that band the rail now scrolls, and at 700px tall it clips a list row at its
boundary. The strip alone needs most of the budget, so there is no arrangement that shows the strip,
three legend rows, several list rows and a usable globe at once on a short landscape screen. Something
has to scroll and the globe should not be the thing that shrinks. It is a trade, not a solution.

### Depth revisions, which I had scoped out

The revision feature tracked magnitude only, and I wrote at the time that tracking one thing honestly
beat tracking four vaguely. That reason expired the moment the mechanism existed. Depth matters as much
as magnitude to anyone downstream: 40km is inside a descending slab, 10km is the crust, and shallow is
where the damage happens.

One trap in it. Both feeds spell "no depth given" as `NaN`, and `NaN !== NaN`, so the obvious comparison
reports a revision on every re-poll of an event that never had a depth. That is the same class of
mistake as counting re-polls as magnitude revisions, which would have made the count meaningless in a
day. The panel prints only the half that moved, because showing an unchanged number beside a changed one
reads as though both had shifted.

## A third sweep: a panel describing what the globe was not showing

Pinning a magnitude 2.7 and then raising the magnitude filter to 6 left the detail panel describing that
earthquake in full, with its depth, its neighbours and its whole sequence, beside a headline reading **0**
and a globe with nothing on it. Exactly the inconsistency the headline count was fixed for, one panel over.

Kept rather than closed. Losing a pin because a slider was nudged is worse than holding one, and the app's
habit is to say the awkward thing rather than tidy it away, so the panel now names it: "Outside the current
filters, so it is not on the globe."

Browser Back looked broken in the same probe and was not. The app rewrites its link with `replaceState` and
never pushes, which is a decision made early and documented, so a fresh tab has one history entry and Back
correctly leaves the app. My test had measured `about:blank`.

## The cost I said was probably fine was 56ms

`findNearby` walks the whole buffer, and the panel re-renders every second because the rail's clock ticks.
I wrote that up as a known cost and left it live, arguing that memoising would freeze the neighbour list
while somebody watched a live sequence. The argument was fine; the premise was never checked.

Measured, at a full buffer where every event is inside the radius, which is what a swarm actually looks
like: **55.9ms**. Three dropped frames, every second, for an answer that had not changed.

Two fixes, and the order matters. First the function: it sorted all fifty thousand neighbours to take the
top four, which is `O(n log n)` for a fixed-size answer. Selecting them in one pass took it to **24.2ms**.
Then the real one: the panel memoises on the feed's revision rather than recomputing on every render. That
keeps it live, because the revision moves whenever an earthquake does, and takes it off the clock entirely.

It has a budget now, expressed as a ratio like the event layer's. Not because it is on a hot path any more,
but because a regression here would land straight back on every arrival, and the whole reason this was
wrong for weeks is that nobody had put a number on it.

## Both feeds, served from the test

The browser suite talked to USGS and EMSC for real, and that was the one thing keeping it out of CI.
The cost was not theoretical: in a single afternoon the feeds became unreachable three times and the
suite went red with four, then nine, then one failure. None of those tests assert anything about data.
They are layout, colour and interaction tests that time out waiting for content, so a quiet network
looked exactly like a broken app, and every red run cost a diagnosis before it could be dismissed.

`e2e/feeds.ts` generates a day rather than replaying a recording. A recording pins the *shape* of a
response, which the source unit tests already do against committed samples; what a browser test needs
is a plausible day positioned relative to now. Fixed timestamps would age out of the 24-hour window
within a day of being committed and the suite would rot quietly.

Three details that decide whether the fixture is worth anything:

- **Gutenberg-Richter magnitudes, not uniform.** A uniform draw puts a magnitude 7 on screen every few
  minutes and quietly makes every magnitude filter test meaningless.
- **Real margins with a run to them.** Blobs collapse to one marker each under clustering, which would
  leave a fixture planet with eight dots on it. The regions panel also needs real coordinates to have
  anything in it.
- **EMSC disagrees with USGS**, by seconds of origin time, tens of kilometres and a couple of tenths of
  magnitude. A fixture where both agencies agree exactly would make the association logic, which is the
  project's whole subject, look correct while exercising none of it.

The socket is stubbed rather than routed, because EMSC pushes over a WebSocket that `page.route` never
sees. The stub needs `send`, which the real source calls on open: without it the first version threw an
uncaught error in the middle of app startup, and the symptom was a headline stuck at zero.

**The suite went from 5.6 minutes to 2.7.** Not from the fixtures directly, but from what they allowed:
serial execution existed because every test shared two live agencies, and parallel workers would have
multiplied the request rate against somebody else's servers. Four workers turned out to be too many,
saturating the machine at 584% CPU and failing three tests on an entrance spring that took longer than
its poll allowed. Two halves the wall clock without turning the suite into its own load test.

## The CI gap, demonstrated rather than argued, and then closed

Halfway through this pass both feeds became unreachable from this machine, and the browser suite went
from green to **nine failures**. Seven were pure layout and design assertions, at every breakpoint,
that have nothing to do with the network: they time out waiting for content that never arrives. When
the feeds came back they passed again untouched.

That is the open item about browser tests staying out of CI, stated as a measurement instead of a
worry. Seven tests that assert nothing about data will fail on a quiet network, so the fixture work is
not a nicety.

## The globe was a disc, and now there is a sun

Told the interface still did not land, I stopped fixing and looked at a screenshot properly. The globe
was a navy circle with outlines on it. Correct, unlit, and reading as a diagram of Earth rather than as
Earth. Nothing on screen said *this planet, this minute*, which is the entire claim the app is making.

A terminator fixes that with a fact instead of with styling. The sun really is overhead somewhere right
now, half the earthquakes on screen are happening in the dark, and a lit sphere has a form that a flat
fill never will.

**NOAA's low-precision solar position algorithm**, not a hand-waved approximation, because this app has
a section called Honest Numbers and a terminator in the wrong place is a lie that looks like a
rendering choice. The part a naive version drops is the equation of time, and dropping it puts the edge
up to a quarter of an hour out, which is four degrees of longitude: visible, and wrong for a reason
nobody would ever go looking for.

The test that mattered is the one I got backwards. In early November apparent solar time runs about
sixteen minutes *ahead* of mean, so by 12:00 UTC the sun has already crossed the Greenwich meridian and
sits four degrees **west** of it. I asserted east, the code said west, and the code was right. Testing
this against golden values from a first run would have pinned whichever sign I happened to ship.

**One shell, not a light per layer.** The land fill, the graticule, the plate boundaries and the
coastlines have to dim together or the night side looks like a rendering fault, and four shaders that
must agree is four chances for them not to. It sits above the coastline and below the markers, because
an earthquake at 3am is not dimmer than one at noon.

**Darkening alone was not enough.** The first version only dimmed the night side, and the result was a
globe that was dimmer rather than lit: the dark half receded and the bright half stayed exactly as flat
as before. It now darkens one side and lifts the other in a single pass, with the two factors
deliberately disjoint so they meet at zero across the terminator. Overlapping them paints a band of
mid-grey along the edge that reads as haze on the lens rather than as dawn.

Recomputed once a minute. Once is wrong for a page somebody leaves open, since the terminator would
freeze at the moment they arrived while the earthquakes kept coming: a stale claim about the world
sitting beside a live one. Per frame is pointless, because the edge moves a quarter of a degree a
minute.

## Two interface gaps the terminator work made visible

Having finally looked at the app rather than at its tests, two things stood out.

**The hover tooltip named an earthquake and nothing pointed at it.** Among two hundred markers a label
floating near the cursor is a guess, and the cursor is deliberately not on the marker: the hit test
works geographically and accepts a near miss, which is what makes a 3px dot clickable at all and
exactly what makes an unanchored label ambiguous. A ring now marks the dot the label is about, lighter
than the selection ring because hovering is not choosing. The pointer cursor was already there.

**The rail had one focal point and buried the interesting fact.** The event list is newest first, so a
magnitude 6 from eight hours ago sits forty rows below forty magnitude 2s. "What was the biggest one"
is the question a person actually arrives with, and it was the hardest thing in the panel to answer.

It sits under the count now, coloured on the ramp, and clicking it pins and flies. Computed inside the
histogram's existing walk rather than in a pass of its own, because that function already visits every
event in the buffer and a second full walk to answer a one-line question would be the same mistake the
neighbour search just had fixed.

Extracting `agoShort` fell out of it: the compact form was inline in the event list, and a second copy
in the rail is how "5h" and "21 hours" end up side by side in one panel, each correct on its own.

## The globe was see-through, and it was the winding

Reported directly: the far side of the planet was visible through the near side. Real, and mine.

The land fill is drawn with `depthTest: false` and relies on back-face culling to hide the far
hemisphere, which is the fix for the fill sagging into the ocean sphere. Culling only works if the
winding is consistent, and it was not: earcut preserves the winding of the ring it is handed, and
Natural Earth's polygons are not all wound the same way.

Counted: **1,559 of 303,360 triangles faced inward**. Their far-side copies survived culling and their
near-side copies were removed, so a handful of landmasses showed faintly through the ocean from the
other side of the world. It reads as a transparency setting rather than as a bug, which is why it
lasted.

Fixed where it starts, at build time: one pass over the index buffer flipping any triangle whose face
normal disagrees with the outward radial. The test asserts zero inward triangles, and a second one
asserts the flip count is *not* zero, so if the source data ever becomes consistent the pass can go
rather than sit there forever being a precaution nobody can evaluate.

## The dashboard became a window

Told the interface still read as "oh, cool" rather than "oh, this is cool", with a list of what was
missing. The list was right, and most of it was structural rather than a matter of polish.

**The globe now fills the frame and the interface floats on it.** The rail was a column beside the
canvas, so the planet stopped at a hard vertical line 356px in and the app read as a dashboard with a
globe component in it. The panels are translucent and blurred over a full-bleed canvas now, and the
globe centres in the whole frame rather than in the space left over, so it passes behind the rail
instead of dodging it. A planet that ends where a panel begins is a picture of a planet.

`saturate(0.6)` on the blur matters more than it looks: without it the magnitude ramp bleeds through
the panel as a wash of orange behind the numbers, which is hue arriving in the chrome by the back door.

**The legend moved onto the map.** It explains what the marks mean and it spent its life in a sidebar
two hundred pixels from the nearest mark. The key hints went with it, which also answers "where are the
key labels": they existed, at the bottom of a scrolling rail, which is not the same as being visible.

Rendered once and placed in one parent or the other, not duplicated and hidden. On a phone a floating
legend covers half a 60dvh globe, so below 1280 it goes back in the rail, and the usual two-copies
approach would put a second magnitude slider and a second pair of source toggles in the accessibility
tree: a worse bug than the one it solves.

**The rail edge drags.** Both sides genuinely want the space and which one wants it more depends on
what somebody is doing: reading the list wants a wide rail, watching a sequence wants none of one. It
is a `separator` with `aria-valuenow` and arrow keys, not a bare div with a pointer handler, for the
same reason the camera got keys. The width is remembered.

The drag listens on the window rather than the handle, because a pointer moving faster than layout
leaves a 4px target behind and the drag would stop the moment the cursor overtook it.

## The map, as one geometry

The obvious build is two scenes: sphere positions in one, equirectangular in the other, cross-faded.
It doubles every buffer, it doubles every place a layer can be forgotten, and the switch is a
dissolve, which says nothing.

There is one set of positions, on the sphere, and the plane is derived from them in the vertex shader:
`asin` and `atan` recover latitude and longitude from a point, and the result is mixed with the sphere
position by one uniform that every layer shares. A planet unwrapping into a map says what a projection
*is*, which is the thing a flat map of earthquakes most needs its viewer to understand: Greenland is
not that big and the poles are a lie.

Sharing the uniform object rather than passing a number is what makes "did I wire that one up"
unanswerable in the wrong direction. The stock materials learn it through `onBeforeCompile` rather
than being rewritten as custom shaders, which would have been four more shaders to keep in step.
`customProgramCacheKey` is not optional there: three.js caches programs by material key, and two
materials differing only by an injected shader hash to the same key, so the second silently reuses the
first one's program.

The camera flies between orbiting a sphere and facing a plane on the same number as the geometry.
Switching at the halfway point instead shows a frame of a flat map at an oblique angle, which looks
like the projection has broken rather than like a projection. Drag becomes a pan past the halfway
point, because a drag that is half a rotation and half a pan tracks neither.

The facing tests fade out with the morph. A map has no far hemisphere, and the test that hides one on
a globe would delete half the earthquakes on a map.

## The chrome stopped being a layer over the picture

Four things were still drawing a box around the subject, and each was a different excuse for the same
line.

**The header was a bar.** Removing its border left it on a strip of deck the same colour as the rail,
which is still a band: the planet started 46px down. Taking it out of the grid and floating it lets
the canvas run to the top of the window, which is the argument the rail had already won. Its height is
a declared variable rather than a measured one, because the rail has to start below it and reading a
height back from the DOM is a resize observer feeding a layout that one number states outright. The
bar is `pointer-events: none` with the controls taking their own clicks back, since an invisible strip
that eats a drag is a dead zone across the top of the map.

**The panels were 82% opaque**, which is a panel with the globe faintly behind it rather than the
globe with type on it. At 44% the seam is gone. The blur is what makes that legible rather than the
fill, so it went up as the fill came down, and `saturate` had to come down with it: halving the fill
doubles how much of the ramp bleeds through as a wash of orange behind the numbers, which is hue
arriving in the chrome by the back door.

**The atmosphere was a halo with no planet under it.** It is the one layer deliberately outside the
morph, being a glow rather than geography, and that left it sitting at the origin on the flat map: a
soft blue disc a radius across, reading as an empty sea over Russia and China. It fades out with the
morph rather than being hidden at the end, because it has to be gone before the geography is flat
enough to make it obvious.

**The map's edges were dashed.** A sphere ends in a fan of triangles meeting at a point, and a fan
cannot tile a straight line: flattened, each apex sits at its own column's longitude and the gap
between neighbouring apexes is a notch, ninety-six of them along each edge. Repeating the map put two
of those edges beside each other and made it obvious. Pulling every apex back to the latitude of the
ring below it makes those triangles zero-height on the map, so the shell ends in a line. It is an
attribute the plane reads and the sphere position ignores, so the globe is untouched. The cost is the
last degree and a half of ocean tint at each pole, under ice the land fill draws over anyway.

## The panel can leave

Closing was a cut where opening was a slide, and the reason was structural rather than a missing
curve: a conditionally mounted node cannot animate out. React removes it on the same frame the
selection clears and there is nothing left to transition.

So the panel outlives the pin. The last pinned event is held, the panel stays mounted with
`data-open="false"`, and CSS does both directions: `@starting-style` supplies the from-state on
arrival, and `transition-behavior: allow-discrete` lets `display` join the transition so the panel
leaves the layout only after it has finished leaving the screen. Transform and opacity only, because
the column is `auto` and animating the track would reflow the canvas every frame for the duration,
which is a smooth panel bought with a stuttering globe.

That block is deliberately unlayered. Inside `@layer components` the closed `display: none` loses to
the `flex` utility on the element, which lives in Tailwind's own layer, and the panel fades to nothing
while still holding its column. The browser test caught exactly that, because it asserts the panel is
not visible rather than that it is unmounted.

## Both edges of the rail are draggable

The width splitter was one axis of a general problem: every edge in this rail has two sides that
genuinely want the space, and which one wants it more depends on what somebody is doing. So there is
one `separator` component for both axes rather than two nearly identical ones, since the part worth
having once is the accessible part: `aria-valuenow`, arrow keys, shift for the coarse step. A splitter
that only answers a mouse is a control a keyboard user can see and cannot touch.

The horizontal one sits under the regions, which had been truncated to the top four with no way to the
rest. That was the wrong half of the fix: a region with two events is exactly the one somebody
scanning for where today is quiet wants to see, and it was the one being cut. All twelve are rendered
into a sized scrolling box, which shows the same four by default and admits the others exist.

`aria-orientation` describes the separator, not the drag. A splitter you move up and down is a
horizontal line; naming it after the gesture is the reading that feels right and is wrong.

## Depth, at last

Every other view answers "where". Depth is the dimension the data has always carried and no picture
could show: on a globe or a map it is a filled or hollow ring, which says shallow or deep and nothing
about structure. Drawn against distance instead, the same events say what they are. A line across
Japan puts the Pacific plate on screen diving west, because the earthquakes *are* the slab.

This is the one thing the flat map does better than the globe, which is the argument for the map
existing at all: picking two points on a sphere somebody is rotating is a guess, and picking them on a
map is a drag.

**The gesture is shift and drag, and it takes the drag away from the camera in the capture phase.**
`controls` listens on the same canvas for orbit and pan, and a capture-phase listener on an element
runs before that element's bubbling listeners whatever order they were added in. Stopping propagation
there is the whole of "this drag is not a pan": no mode is held anywhere and the camera never learns
about it. A modal "draw a line" button would have been a mode to get stuck in. A shift-click with no
drag clears instead, because its length would be zero and the panel would open to say nothing found;
making it the undo for shift-drag is the guess somebody would make anyway.

**Along-track and cross-track by vector algebra, not bearings.** The bearing formulation needs an
`atan2`, a difference of angles that has to be wrapped, and an `asin` whose sign has to be reasoned
about. The vector form needs a cross product and two dot products and gets the sign of the offset for
free. Both are exact; one is readable in six months. Events past either end are dropped rather than
clamped, because clamping piles every event in the wider region onto the two edges as a vertical stack
that reads like a fault.

**1:1 where it fits, and the exaggeration printed where it does not.** A 3,700km line against 150km of
depth is a band four pixels tall at true scale: correct, and a picture of nothing. Every geological
section in print handles this by stretching the depth axis and saying by how much, because a stated
exaggeration is something a reader can undo in their head and an unstated one is a lie about the dip.
Sizing the box from the aspect ratio was the first attempt, and it made the panel's height a function
of the line somebody dragged: a 200km section eight hundred pixels tall, a 4,000km one four. Fixing the
width and clamping the height puts the whole distortion in one number worth printing.

**Stored left to right, whichever way it was dragged.** The panel plots zero at its left edge, so a
line dragged east to west put the map's right-hand end at the panel's zero and nothing said so.
Normalising on commit means both pictures read the same direction and neither has to explain itself.
The browser test for that started as a tautology: it compared the stated length, which is the same
either way round, and survived deleting the normalisation. It compares where the marks land now.

**The line is SVG, not scene geometry.** It is two points and a corridor, and putting it in three.js
means a geometry, a material, an `aLonLat` attribute and a place in the render order for something
that is chrome. `project` already turns a coordinate into a screen position for the tooltip, so this
is that call twice. It hides on the globe: a great circle projects to a curve there, and drawing it as
a straight screen line between two projected points would be a wrong picture rather than a simplified
one.

**A mark in the section is an event, not a dot.** It shipped read-only for a version: it would put a
magnitude 5 at 400km on screen and offer no way to find out what it was, while the same event was one
click away in the list beside it. Clicking a mark pins it, clicking it again unpins, and the pinned and
hovered marks are ringed achromatically for the reason every other ring here is. The hovered event takes
the header's metadata line rather than getting a floating tooltip: a label following the cursor inside a
120px band covers the marks either side of the one it is naming, and the section's own geometry is not
what somebody is reading while pointing at a dot. The SVG stays out of the reading order, like the
canvas, because the event list is already the accessible view of the same events and shares this panel's
selection.

**The bottom band stops where the pinned panel starts.** It ran to the right edge, which had been
truncating the key hints under the panel since before the section existed and, once the section joined
the band, hid a fifth of it behind the event it had been opened from. The panel's width is a variable
now so the two agree.

**Plate boundaries are ticked on the distance axis.** The section could show a slab and not say why one
was there; a tick where the line crosses a plate edge turns the picture into a claim, because the
earthquakes begin at the boundary and descend away from it. Found by sign change in the cross-track
offset over the boundary vertices, which is the same `project` call the events already use, rather than
by intersecting two great circles.

The first version carried a guard against the far side of the planet, on the reasoning that the great
circle through the two ends is a whole circle and boundaries cross it everywhere. That is true and the
guard was dead: measured against a thousand short lines scattered over the globe it changed nothing,
because a crossing whose distance along is inside the section is on the section by construction. It came
out. What stayed is a guard against `atan2` breaking at the antipode of the start, where interpolating
between one end at +20,000km and the other at -20,000km is not arithmetic about anything and lands at
zero, which is inside the section and looks deliberate.

**The section is in the link, and it brings the view with it.** Which projection somebody was using is
deliberately not in the permalink: a link carries where they were looking, and the projection is a
preference that would arrive as a surprise. A section is the exception and it is not that rule bending,
because a section has nowhere to be drawn except the map. The link is not saying "use the map", it is
naming a slice; opened on a globe the panel would describe a cut with no line anywhere. So a fragment
holding `x=` arrives flat whatever the recipient's own preference says.

Two things came out of writing it down. A line with both ends in the same place is dropped rather than
restored, because its length is zero, nothing falls inside the corridor, and a panel reporting nothing
found reads as a broken link rather than an edited one; the gesture cannot produce that, since a drag
under twelve pixels is a dismissal, so it only ever arrives from a hand-typed URL.

And `wrapLon` was not idempotent. The modulo form is exact in principle and not in floating point: it
turns 145.8 into 145.79999999999995, which survives rounding on the way out and comes back through
`decode` unrounded, so a section did not equal itself after a round trip. It returns a longitude that
is already in range untouched now, which the camera's own field had quietly needed too.

## The map has no edges

A flat map that stops at 180 puts the Pacific rim in two corners with a void between them, which is
exactly the comparison the map exists to make. So the world repeats: pan east past Kamchatka and the
Aleutians come round again.

**Drawn again, not wrapped.** Offsetting each vertex by whichever copy it falls in is cheaper and it
tears: the three corners of a triangle near the seam land on different copies and the triangle is
stretched across the world. That is the same failure this projection has already produced twice from
other causes, and it would come back the moment somebody panned. Repeating the *draw* cannot tear,
because every copy is the same geometry seen from a different place.

So the geography, the events and the wavefronts sit in one group, and the frame renders it once per
visible copy with the group shifted by a period. `autoClear` is on for the first pass and off after,
so the copies composite rather than erasing each other. The atmosphere is deliberately outside the
group: it is a halo around a planet, and there is only one planet.

`visibleCopies` decides the range, and it is the part that fails quietly. An off-by-one leaves a
strip of void at one edge, which reads as the end of the world rather than as a missing draw call, so
it is a pure function with a test that sweeps camera positions and zoom levels and asserts the drawn
copies cover the view. Writing that test caught the first version drawing one wasteful copy off each
end: the copy containing a point is the *nearest* multiple of the period, not `floor` and `ceil` of
the edges. Two passes is the normal case, one when zoomed in, three only with the whole world plus
both edges on screen.

**The wrap made the poles visible.** Tiling put the top edge of one copy beside the top edge of the
next, and a sphere's pole fan cannot tile a straight line: each triangle's apex sits at its own
column's longitude, so the edge is a row of teeth. Rather than rebuild the shells with a squared-off
pole row, a plane in the ocean colour sits behind the map. The teeth land on identical colour, and
the map gains a defined edge it did not have before.

## The antimeridian, and two wrong theories about it

Flattening produced streaks across the map, and I was wrong about the cause twice.

**The fragment-derivative trick does not work here.** The usual answer is to discard fragments whose
longitude changes fast across a pixel. `fwidth` measures change *per pixel*, and a triangle stretched
across nine hundred pixels has a tiny per-pixel derivative: the test catches seam triangles when they
are small on screen, which is the globe, and misses them exactly when they are the problem. I shipped
it, looked at the screenshot, and took it out again.

**It was the poles, not the seam.** At a pole the position is `(0, ±r, 0)` and longitude does not
exist: `atan2(0, 0)` returns zero. Every meridian's polar endpoint and every polar vertex of Antarctica
therefore lands on the prime meridian, and each triangle or segment touching one stretches from there
to wherever its other corners are. No span test catches that, because 170 degrees is not more than 180.

Fixed where each layer is built: coastline segments crossing 180 are dropped, as the plate boundaries
already dropped theirs; the graticule's meridians stop three degrees short of each pole; sphere
geometries have their seam column and pole fans removed from the index buffer.

**The land fill was a real bug, and dropping seam triangles after subdivision does not fix it.** A
triangle from 179E to 179W is split into children through longitude zero, and each child spans just
under 180 degrees: under any threshold that keeps Antarctica, which legitimately has triangles spanning
120 degrees near the pole because a wide sweep of longitude down there is a short arc. The children
pass and each draws a sliver across the map. Filtering before subdivision, in longitude and latitude
where earcut worked, takes the worst remaining span from **123.6 degrees to 19.4**.

**The root cause was deriving a quantity that had already been thrown away.** `fmProject` recovered
longitude from the sphere position with `atan2`. That looks equivalent to carrying it and is not, in a
way that only appears once something interpolates *between* two vertices:

- Densifying walks the shorter way round the date line and emits longitudes past 180. Earcut
  triangulates in that space quite happily. `atan2` then folds 180.5 back to -179.5, and a triangle two
  degrees wide is drawn spanning the world.
- At a pole longitude does not exist. `atan2(0, 0)` returns zero, so every meridian ending at a pole, and
  every polar vertex of a sphere shell, is dragged onto the prime meridian. The seam filter cannot see
  those either: they all report a longitude span of zero.

Both are the same mistake. The fix is an `aLonLat` attribute carrying the coordinates each layer was
actually built from, so the plane position is exactly what the triangulator worked in. That is one
attribute on four static layers and two dynamic ones, and it deletes a class of bug rather than
patching instances: the graticule's meridians reach the poles again, and the pre-subdivision seam
filter is now the only guard that has to exist.

Two things fell out of it. The sphere shells have no source coordinates, so they derive theirs, and
their pole rows take longitude from the texture coordinate, which knows what the position does not. And
the plate reveal reorders segments, so the attribute has to be reordered with them: otherwise every
segment carries some other segment's geography, which is invisible on the globe and draws the map as
noise.

**The diagnosis before this one was wrong**, and the way I was reading evidence was why. Hiding one
layer at a time and judging what changed is unreliable at these contrast levels; it produced two
confident and contradictory answers. Rendering each layer *alone* settled it in a single run. That is
the experiment to run first next time.

## The lines across Siberia were three bugs in a row

Told there were still straight lines across the map, I isolated each layer by rendering it alone, and
had to fix the method before it gave an answer. Screenshots of a WebGL canvas come back blank once the
render loop idles, because the drawing buffer is cleared after compositing and nothing redraws it, so
the first several isolation runs produced identical empty frames that looked like meaningful evidence.
Holding the loop awake was the difference between a measurement and a wasted hour.

**The terminator.** The night shell carried the sphere normal as a varying, and flattening stretches
its triangles: each quad splits into two that interpolate differently, so a crease runs along every
shared diagonal, and ninety-six columns of parallel creases read as long diagonal streaks. Longitude
and latitude interpolate *exactly* on the map, because the map is the lon/lat plane, so the direction
is rebuilt per fragment from the attribute every layer already carries. It is mixed with the
interpolated normal rather than switched, since on the globe the interpolated one is the exact one and
a hard swap partway through the morph would be a visible jump. The normal also moved to object space:
nothing above it rotates, and the one thing the model matrix carries is the offset that repeats the
map, which was moving the sun four world units on every copy but the middle one.

**The backdrop was drawing over the geography.** Isolating the land fill produced a blank frame, which
was not the land failing but the plane I had added behind the map. Three.js draws every opaque object
before any transparent one and `renderOrder` only sorts within each of those two lists, so a
transparent backdrop paints over everything regardless of its order. The only reason it had not was
that the ocean shell happened to write depth in front of it. It is opaque now and fades from the void
to the ocean by colour rather than alpha, which is the same picture out of a list where its order
means something.

**The wedges were a polygon that is not a polygon.** Three Natural Earth rings hold both +180 and
-180, the largest being the 1,320-point Eurasia ring, which crosses the antimeridian exactly twice:
out at 178.6E and back at 180W. Read literally that ring teleports across the world halfway round its
own coastline, so it is self-intersecting in longitude and latitude, and earcut promises nothing about
a polygon that is not simple. It emitted wedges a hundred and fifty degrees long and a quarter of a
degree thick: no area to speak of, invisible on a globe where longitude is compressed at those
latitudes, and a hairline across the ocean the moment the map existed. The seam filter caught the ones
wider than half the world and had no reason to catch these.

Unwrapping runs the coastline past 180 rather than jumping back, which is what the shape does. Two
things fell out of it, both the same mistake one layer down from the original `atan2` one:

- The shift has to be per polygon and it has to be recentred. Accumulating from wherever a ring starts
  left Eurasia a full turn west, because that ring starts inside the Chukotka tip, and recentring each
  ring on its own mean put a hole a turn away from the coastline containing it.
- `midpoint` folds its answer back into plus or minus 180. Correct for two points on a sphere, and it
  tore every subdivided triangle whose vertices had deliberately been put past 180. Subdivision uses a
  plain average now, which is safe because the seam filter already guarantees nothing reaching it
  spans half the world.

The test is on the ring, not on the mesh, because the mesh cannot tell the difference: an ordinary
earcut needle over Kazakhstan spans 16 degrees and one out of the date line spanned 19, so no threshold
on triangle width separates a wedge from the triangulation working normally.

## The dated look was eleven name badges

Told the interface still read as old, I finally reached for the design skill in the environment rather
than hand-rolling taste. The first honest finding is that it is **out of scope**: it is written for
landing pages and portfolios and says so, and this is a data instrument. Most of it does not apply.

Three of its rules do, and one of them was the answer. It has a mechanical check for "eyebrows", the
small uppercase tracking labels above section headings, and calls it the most-violated rule it has:
count them and compare against roughly one per three sections. This app had **eleven**. Each was
defensible on its own. Together they were the templated rhythm that reads as dated.

The other two: at high density it bans card containers, which is why the panel's notes are now a left
rule and spacing rather than boxes; and it rations the middle dot to one per metadata line, which took
"3m · 155 km · USGS EMSC" apart and turned two agency readings into aligned columns. That last one
stopped being a formatting rule halfway through: two readings of one earthquake laid out in columns is
a comparison you can scan, which is the project's whole subject, and as a concatenated string it was
not.

Worth recording that the skill also confirmed things: sharp corners used consistently, mono for every
number, one accent family reserved for data. Those were already right, and knowing which parts were
already right is what made it obvious which part was not.

## The void at the edge was not the arithmetic

The east half of a phone went void with its earthquakes still floating in it: no ocean, no coastline,
no graticule, and the markers that belong to that longitude drawn over nothing.

`visibleCopies` was the obvious suspect, having been written as the part that fails quietly and given a
test for exactly this symptom. It was innocent, and provably: at the camera and zoom that produced the
void the arithmetic asks for two copies, and the coverage test sweeps that case. Reading the numbers
back out of the rendered frame took a while precisely because they kept saying the copy was requested.

It was requested and then discarded. Every layer here is projected in the vertex shader, so three.js
measures the sphere the geometry was built as and never the plane it draws: flat, a layer really
occupies x from -2 to 2, and its bounding sphere still says radius 1.3 at the group origin. Offset by a
period to repeat the map, that sphere leaves a narrow frustum while the triangles it describes are
still on screen, and the copy is culled before it is drawn. A wide window hid it, because a wide
frustum still catches the stale sphere. A phone does not.

The markers survived because `events` and `rings` had already turned frustum culling off, for their own
reasons, long before there was a map to break. So the cull took the world out from under the data and
left the data, which is what made it look like a projection bug rather than a renderer one.

Turned off for everything under the group, in one traverse rather than at each `add`, so a layer added
later cannot miss it. Correct bounds for both views were the alternative and were rejected: two shapes
sharing one geometry have no honest bounding sphere smaller than the union, the union is most of the
frustum anyway, and `visibleCopies` already limits the passes to copies that reach the screen. The
culling was never buying anything here.

**The lesson is about where the frame was measured.** It is reachable at any narrow viewport and it
survived a design contract with a phone breakpoint in it, because nothing in that contract looks at the
canvas. It was found by taking a screenshot on a phone-shaped window and noticing that the ocean
stopped.

## The transport shipped pointer-only

The cursor and its play control had no key bound to them, three entries after the one above that says
a documented shortcut nobody can see is a secret. Tab reaches both, so this was never inoperable, but
tabbing to a clock to move it one bar is not a path anybody uses, and the hint strip did not admit
either control existed.

**The arrows were not available, and taking them would have been the wrong trade.** The obvious
binding is left and right, and left and right are the camera. Rebinding by mode, so they scrub while
parked and orbit while live, gives one key two meanings decided by state somewhere else, and the hint
strip's own rule is that a row claiming a key that does something else is worse than no row. So `,`
and `.`, which are the scrub convention, are free, and can be printed without the strip lying. Space
plays. Both go through the same "only while nothing is focused" rule the camera keys use, so a focused
button keeps space and a focused slider keeps its arrows.

**On the transport itself the arrows are the step, and that was the actual bug.** The track is 0 to
1000 so a drag is smooth, which made one arrow press a thousandth of the window: 86 seconds at a day,
43 minutes at a month. Neither corresponds to anything drawn on the strip above it, so the cursor
moved and the picture did not, at every width. A bucket is the smallest step the bars can show, and
the step reads `BUCKETS` from the histogram rather than restating 24, so the two cannot drift.

**A defect the test found, not the implementation.** Three steps back and three forward parked on the
`to` of three presses ago. The wall clock has moved since, so the cursor read as exactly live, drew
every event in the buffer, and the headline went on saying held. The rule that fixes it is that the
last bucket is the bucket ending now: a step forward that lands anywhere inside it hands back to live,
rather than only one that overshoots. Stepping still costs one press per bar, which is the thing that
made the naive version of that fix wrong.

## Each feed's reach, which only one number was ever reported for

`coveredSince` is the earliest either agency will vouch for, which is the right left edge for the
strip and the wrong number to show beside two feeds: it takes whichever reached furthest and lets the
other stand behind it. The header printed a count per feed and a `both` count over the whole span,
and nothing said where corroboration was even possible.

**Checked against the live endpoint rather than reasoned about, and it is worse than I had recorded.**
`fdsnws/event/1/query?limit=600&start=...` returns the same most recent 600 rows at 24 hours, 7 days
and 30 days: on the day I measured it, oldest 2026-08-19T09:36Z against a 2026-08-20T03:02Z newest,
about eighteen hours. Widening the window buys nothing at all from EMSC. Raising the limit is still
not on: the endpoint has never documented a maximum and a wrong guess is a 400 that removes the seed
entirely.

The honesty machinery was already right and simply not being asked. A full page makes the source vouch
only as far as its oldest row, so the truncation was reported correctly and then averaged away by the
`Math.min`. The fix is a per-source copy of the same value, on the same widen-only rule, so a window
change that re-seeds cannot make an agency's reach go backwards.

**The label is on the agency's own button, and the sentence only appears when they disagree.** A
permanent line explaining a discrepancy that is not on screen is how a caveat stops being read, so
this follows the strip's note about unobserved blocks. Both get an `aria-label` carrying the same fact
as a sentence, because `USGS 18h` announced as two tokens is a toggle and a quantity with nothing
joining them.

**Truncated and missing are separate clauses.** A source that returned a short page was capped; one
that returned nothing failed, and it has its own notice elsewhere. The first draft had a single
sentence over both, which pinned EMSC's cap on a feed that never got as far as being capped.

**The fixtures could not reach the interesting branch.** The default browser fixture returns fewer
rows than the seed limit, so EMSC vouched for the whole window and the truncated path never ran in a
test. `emscCappedHours` answers with exactly a full page over a span the test names, which is the
state the real endpoint is in every day.

## The coverage claim, finally measured instead of argued

A seed page that comes back under the row limit is read as the complete catalogue for the span it
asked for, so at a month it vouches for thirty days. The argument was that this is still honest,
because a short page is everything the endpoint held for the query. It was never checked, and it was
resting on two undocumented properties of somebody else's server.

**Both hold, and one of them nearly does not.** The portal accepts a `limit` of 40,000 without
complaint, so the premise that a larger request is a 400 is simply false. But it has a ceiling of its
own at exactly 20,000: thirty days returns 14,958, sixty days returns 20,000, and ninety days returns
20,000 with byte-identical oldest rows. So "fewer rows than I asked for" does not mean complete in
general. It means complete *here*, because `SEED_LIMIT` is 600 and the ceiling is thirty-three times
that, so ours is always the binding limit. The claim is sound for a reason that is not the reason I
would have given.

**Ordering is the other one.** A full page vouches only as far as its oldest row, which is the
coverage edge only if truncation cuts the old end. A `limit=5` query over thirty days returns the
newest five, so it does. Had it ever been ascending, the same code would have vouched for the whole
month while holding the five oldest events in it: not a subtly wrong number, the exact inverse of one.

Both are now assertions in `emsc.live.test.ts`, which is where a fact about somebody else's server
belongs. Neither is promised, and if either moves the app claims coverage it does not have while
looking exactly as it does now.

**Two bugs found by writing the tests the claim never had.** `onSeeded` was an empty function in every
single test in `emsc.test.ts`, so the branch deciding between "a month" and "eighteen hours of it" had
no coverage at all, in the project whose entire argument is that it says what it does not know.

- A truncated page that nothing could be parsed out of fell through to vouching for the whole span.
  That is the one combination where the fallback is exactly inverted: the page was cut short *and*
  there is no way to know where, so it claimed a month on the strength of zero events. It now vouches
  for nothing, and USGS still reports its own.

- The edge was read off the delivered batch rather than off the page. The delivery is the page minus
  whatever the socket had already pushed, so a single duplicate at the old end of a truncated page
  moved the claim forwards in time.

**What is deliberately not changed here.** The 600 stands. Thirty days of EMSC is 14,958 events and
about 8MB on a static host with no Worker in front of it, so raising the cap is a bandwidth decision
and not a correctness one, and the measurement above is what a decision on it should be made from.

## Looking for an artifact that is not there any more

The backlog carried a note about faint axis-aligned rectangles on the flat map, at the seams between
the repeated copies, blamed on the per-copy render passes rather than on the geometry. It is the only
entry here that ends in nothing being changed, which is why it is worth writing down: a decision log
where every investigation produced a fix is a log with the failures edited out.

Eleven captures, at 0, 90 and 180 degrees, at two zooms, and at six delays through the globe-to-map
morph. `Date.now` frozen for all of them, because the subsolar point comes off the wall clock and two
shots minutes apart are otherwise two different pictures. Then the shell isolated properly: the same
frame rendered again with `night.visible = false` and the two differenced, so what is measured is the
shell's own contribution and nothing else.

Nothing. No straight step in that difference, vertical or horizontal, at any of those views, including
at the date line where the copy boundary actually falls. What does show up, and what I suspect the
original note was:

- Full-height vertical lines at regular spacing, 67px at zoom 0.75 and 90px at zoom 1. That is the
  15 degree graticule.
- A hard-looking right edge to the day wash, which is `smoothstep(0.10, 0.55, sun)` reaching zero.
  On ocean rows it falls from 24.5 to 13.7 over 24 pixels. Smooth in value and not in slope, so it
  reads as an edge while being the ramp this file already argues about twice.
- Horizontal edges at the top and bottom of the map, which are the map's boundary against the void.

I did see a 50px dark band at the date line once, and it went away when the shell was hidden, so it
was the shell. It has not reappeared in ten attempts at the same URL and zoom. One unreproducible
sighting is not enough to refactor the hot render path against, so it is recorded and left.

**Two real per-copy faults turned up on the way, and neither of them is a rectangle.** `rim` hangs off
`scene` rather than `world`, so it does not travel with the copies and is additively blended once per
pass; it is invisible at rest but the copy loop starts at `morph >= 0.01` while the rim survives to
0.999, so it brightens in place for almost the whole transition. And `autoClear = false` drops the
depth clear along with the colour clear, so each copy's opaque geometry depth-tests against the
previous copy's leftovers, which is harmless exactly while the copies are disjoint on screen.

## Somewhere to search, over the only two things there are to search

Four region rows were the whole of the navigation. Somebody who wants Japan had to either spot that
"Japan & Kurils" was one of the four currently showing, or drag the globe until it appeared. The rail
names regions by event count, so the four on offer change under you, which is the opposite of
navigation.

**There is no gazetteer, and there cannot be one.** Every geocoder needs a key and the constraint is
that the repo renders its first frame for anyone who clones it. So this searches the eleven authored
regions and the place strings the two agencies wrote on the events currently held, and nothing else.
That is a real limit with a consequence that had to be designed rather than hidden: "Paris" finds
nothing, because nothing has happened there, and with no gazetteer behind it a real place is
indistinguishable from a typo. So the empty state says which of the two it is in, naming the window it
searched and what it searched over. A search that answers a bare "no results" about a city that
plainly exists reads as broken software rather than as a bounded index.

**Regions rank above places because they work at zero.** A quiet Kamchatka is still somewhere to go
and look; a place only exists here while an event of its name is in the buffer. That is also why a
region row carries a count and a place row carries a count and a magnitude: they are different kinds
of thing, and the trail shape is what says so without a second label.

**Places are grouped, and the grouping does a second job.** Three hundred events in the Flores Sea is
three hundred rows behind one name, so a place is one row with its count and its strongest. Grouping
on the case-normalised name is what merges USGS's "Flores Sea" with EMSC's "FLORES SEA" into one row
with a count of two rather than two rows of one, which is the same reconciliation problem this project
is about, showing up in the navigation.

**Ranked on position before size.** "Bridgetown" contains "ridge" and is not a ridge. Matching at a
word start ranks above matching anywhere, so a magnitude 6.9 in Bridgetown still loses to a magnitude
3.0 on the Carlsberg Ridge for the query "ridge". Without it the order is the store's iteration order,
which is arrival order, which means nothing to a reader.

**Two smaller decisions.** The results stand in the region rows rather than beside them, so the rail
does not grow and the block goes on answering one question with a filter applied. And the field is
`type="text"`, not `type="search"`: the search type brings a user-agent cancel button with user-agent
styling into chrome whose rule is that it carries none, and Escape already clears the box as the
innermost rung of the ladder.

**The touch rule was named at places again.** The coarse-pointer minimum listed `button, summary,
a[href]`, whose own comment says that naming the places instead of naming the thing is how a rule
stops covering what it was written for. It then did not cover the app's first text input. It now
covers every input except a range, whose hit area is the eighteen-pixel track by design.

## A scale bar that refuses to be one number

The globe implies scale by being a globe: a sphere carries its own size and nobody tries to read a
distance off one. A flat map invites exactly that reading and offered nothing to read against.

**On equirectangular a horizontal bar is only true where it is drawn.** Meridians are evenly spaced,
so a degree of longitude occupies the same pixels at sixty degrees north as at the equator while
covering half the ground. A bar labelled "2,000 km" and left at that is wrong nearly everywhere, by up
to a factor of eleven at the 85 degree limit this camera allows. So the label carries the latitude it
was measured at, and the bar's pixel length changes as the view moves north and south while the round
number stays put. Panning from the equator to 48 degrees stretches the same 2,000 km from 97 pixels to
145. That is the projection's distortion shown rather than smoothed over, which is the same call as
refusing to let Greenland's area read as a fact.

A vertical bar would need no caveat at all, since latitude scale is constant here. It is not the bar
anybody looks for on a map, so the horizontal one is drawn and told the truth about instead.

**Measured at the view's centre, after measuring it at the bar's own screen row first.** The row
looked more honest and is wrong twice. Zoomed out, the corner the bar sits in is void rather than map,
so asking what latitude is under it returns nothing and the bar never appeared at all. And it was
answering a question the label already answers: a bar that names its latitude is a legend entry, and
where it happens to sit carries no claim. The centre is also the more useful of the two, being the
middle of what somebody is looking at.

**`> 0` was not the guard it looked like.** `Math.cos` of ninety degrees is 6.1e-17 rather than zero,
so a pole-on view passed a positive-kilometres check and asked for a bar 1.5e14 pixels wide. The steps
are spaced by factors of two and two and a half, so a real bar is never more than about 1.6 times off
its target; being eight times off means the view is outside the table, and no scale is then the honest
answer. Caught by a unit test written to assert the pole case returns nothing.

**Two things about looking at it.** The bar rendered correctly for three rounds of screenshots while
being invisible, because the canvas is full-bleed with the rail floating over it and the bar was
placed at the container's own left edge, underneath the rail. And `xl:left-[calc(var(--rail-w)+1rem)]`
silently did nothing, because `calc` requires whitespace around its `+`; a margin does the same job
with no arithmetic to get wrong.

## The signature had nothing saying what it was

The wavefront rings are the thing this design is built around, and the legend explained the ramp, the
size encoding, the depth carve and the plate boundaries while saying nothing at all about them.

They are also the mark that needs it most, and for a reason the other four do not have: every other
encoding belongs to a dot that sits still and can be studied. A ring appears when an event lands,
expands for about fifteen seconds and is gone. A first time viewer gets one look at it, cannot go back
for a second, and had nothing anywhere to check it against.

**A sentence rather than a label, because the multiplier is part of what the mark is.** "Plate
boundaries" works in two words; a ring cannot, because a front crossing the map at twenty times real
speed with nothing saying so would be the only dishonest mark on screen. So the legend reads *a ring
is the P-wave front leaving a new epicentre, sped up x20 or it would not appear to move*, which is
what it is, what the number is a multiplier of, and why the number exists.

**The header's "wavefront x20" came out.** It was a bare figure with nothing to attach it to, and the
legend now prints the same number in the one place it means something. Two identical figures in one
viewport with only one of them explained is exactly the trap the activity axis fell into when it
carried "last N hours" beside a headline printing the same phrase. It was `hidden lg:inline`, so on
anything narrower than a laptop there had never been a persistent readout to lose, and the header
comment about running out of horizontal room got its wish as a side effect.

**Two circles, not one.** The glyph fades outward because that is what the mark does, and a single
outline would read as the hollow deep marker two rows above it. On the ramp, like the markers, since a
ring carries its own event's magnitude colour, which is why the row sits inside the `data-ramp`
subtree the hue rule exempts.

**The constant is passed, not imported.** `PLAYBACK` lives in `globe/rings.ts` next to the physics it
is derived from, and that module imports three, so it is passed in rather than imported here.

*Corrected later, in the entry about `geo/waves.ts`: the bundle half of that reasoning was wrong. This
legend already imports `rampColorAt` from `globe/ramp`, which imports three, so the renderer was in the
eager bundle either way. The boundary is still worth having and the reason given for it was not.*

## The way in was the least interesting moment in the buffer

The app opens on the present, and at a wide window the present is the worst moment it holds. Whatever
is happening this minute is an M2 somewhere; the M6 worth looking at was hours or days ago. The rail
had named the largest event in the window for a while and flying to it was already wired, but it left
the cursor live, so arriving showed the end state of the whole window with the event buried in it and
its sequence already over.

So the row moves in time as well as in space. It parks the cursor at the event's own origin, which is
the moment that event was the newest thing on Earth. The globe then draws that moment, the headline
counts what is drawn and says "held", the panel opens on the event, and the sequence strip shows what
came next while the globe has not drawn it yet. Pressing play from there is the aftershock sequence
arriving, which is the one thing a static map of a month cannot show.

**Through `clamp`, not straight into state.** An event that is already the most recent thing held would
otherwise park the cursor a few seconds behind the present, which is the exact failure the cursor's own
notes warn about: a live app that has quietly stopped being one. `clamp` hands that case back to live.

**The row says what it does before it is pressed.** It is four fragments, a label, a magnitude, a place
and an age, and a click that moves the clock cannot be discovered only by noticing the clock moved. The
accessible name is the whole sentence, including "hold the window at that moment".

**The panel goes on answering its own question.** It says fifteen other events are within 150km "in
this window" while the globe draws nine, and those two are not in conflict: one is scoped to the window
and says so, the other to the cursor and says so. Here it is the point rather than a tolerance, because
what the panel is telling you is what you have not seen yet.

**A fixture that could not have failed.** The first version put the big event alone in the Flores Sea
with every other event off Honshu, so the panel correctly answered "on its own, so far" and there was
no sequence to arrive at. An event with no neighbours cannot demonstrate landing on a sequence, and the
test only found this because it asserted the sequence rather than the pin.

## The one view that shows depth was behind a gesture nobody would find

`CrossSection` draws the dimension neither the globe nor the map can: depth against distance, which is
where the Pacific plate stops being a colour on a marker and becomes a sheet diving west at forty-five
degrees. It was reachable by shift-dragging the map and by nothing else. Undiscoverable with a mouse,
since one line of the hint strip was the only mention of it anywhere, and outright impossible on a
touch screen, where there is no shift to hold. The panel's own comment about the permalink already
says a feature nobody can find is not shipped; this was the same fault in the more valuable feature.

**The orientation is the whole thing, so it is measured rather than assumed.** A section offered from
a button has to choose its own direction, and for a slab there is exactly one right answer: across the
trench. Earthquakes at a subduction zone lie along the trench, so the long axis of the local scatter
*is* the strike, and the slice worth drawing is perpendicular to it. A fixed east-west section would
have been right at Japan and useless along the Aleutians, and offering a useless section is worse than
offering none.

So `findNearby` now fits that axis, by accumulating second moments inside the walk it was already
doing. A separate pass for one angle is the shape of the 56ms regression its own comment records.
Measured about the centroid rather than about the pinned event, since the event sits somewhere on the
trend and measuring spread from a point off centre inflates whichever axis the offset lay along.

**It declines to answer twice, and both refusals matter.** Under five neighbours there is nothing to
fit. A scatter rounder than three to two has a long axis that is only where the noise fell, and using
it would send the section off at an angle that looks deliberate and is not. Both fall back to west-east,
which is not a guess dressed up as a measurement: when there is no long axis every orientation is
equally arbitrary, so the tie is broken by the direction the section is read in.

**Two floating-point traps, both found by tests rather than by looking.** A perfectly straight line of
events has a minor axis of exactly zero and the subtraction that produces it can land a rounding step
below, so rejecting a negative minor axis throws away the single clearest trend there is; it is floored
at zero instead, which reads as maximally elongated, which is what it is. And the reading direction is
normalised so every section runs west to east, or south to north when it runs neither, because
otherwise a north-south trench yields a bearing of 180 and reads top to bottom while its neighbour
reads left to right. The epsilon in that check is load-bearing: `sin` of 180 degrees is 1.2e-16, not
zero, so the exactly-north-south case only comes out right on purpose.

## The card, and the one thing about it that cannot be fixed

The backlog says links unfurl as nothing. They have unfurled as something since the preview shipped, so
the premise was stale, and two real faults were behind it anyway.

**The card was a screenshot, not a card.** An unlabelled dark circle. In a feed the image is a
thumbnail and it has to say which app this is, whatever the client does with the title underneath. It
is now composed: the globe bled off the right edge, the wordmark, a rule, one line, and the two agency
names along the bottom. The line is deliberately not `og:description`, because that description is
printed directly under the image in most clients and repeating it spends the card's only sentence on
something the reader is already reading.

**And it could not be rebuilt.** `index.html` had claimed since the preview landed that the card was
"captured from the app itself by a Playwright script". That script was never committed. The palette
moved twice afterwards and the globe's geometry was rewritten entirely, and nobody could tell whether
the card still matched, because regenerating it meant reconstructing the script from the comment
describing it. It is committed now as `pnpm card`, and it asks the running app for its own colour
tokens rather than restating them, so the card cannot drift from the palette even silently.

Still no earthquakes on it, for the original reason: a card is cached for days by every client that
fetches it, so real events would show one day's seismicity as if it were now, and DESIGN.md section 10
forbids exactly that. The empty globe is the one version of this picture that cannot go out of date.
The filter does the emptying, at `m=7.5`, rather than a flag existing only to make this image.

**A card per share is not available at any price here, and the reason is worth writing down.**
Permalinks are fragment-encoded, and a fragment is never sent to a server. Nothing serving this page
can know which view was shared, whatever it is willing to compute. Moving the state into the path would
only relocate the problem: composing an image per link needs something running, which means a Worker,
which reverses the no-`main` decision the entire zero-invocation deployment rests on. So the backlog
line asking for one is asking to reopen that, and it should be reopened deliberately or not at all.

## The thesis is 4 pixels wide, and that is the whole finding

Two agencies report one earthquake and place it tens of kilometres apart. That is what this project is
about and the map drew one marker and said nothing: the disagreement lived in the panel, as a sentence
you reached by pinning and then reading. Twice I tried to put it on the map, and the second attempt is
what finally produced the number that says neither can work.

**First, a hairline per corroborated event, in the scene.** A `LineSegments` layer beside the markers,
drawn only where the two readings fall in different clustering cells, on the argument that the rule
deciding whether two events are one marker should decide whether their disagreement can be seen. It
worked: 76 ties in the buffer at zoom 2.8, correctly wired, and completely invisible. 15km of
disagreement is **2.7 pixels** at this camera's tightest zoom, the markers are four times that across,
and the ties were drawn under them. Not a tuning problem. Covered by construction.

**Then a ring and a tie for one event at a time,** in SVG over the canvas, on the argument that a ring
is a fixed 16px whatever the separation, so two rings 4px apart still read as two rings and the mark
stops depending on the distance it describes. Measured: tie 4.1px, ring 16px, both on screen, both
opaque. And it reads as a scribble on the dot. A ring four times larger than the offset it is meant to
resolve is concentric, and concentric rings say "decoration", not "two places".

**The measurement that was available before either attempt.** Real separations run 10 to 135km. At
0.08 degrees per pixel, the tightest this camera goes, that is 2 to 24 pixels, against markers of 10 to
20. So a mark at map scale can only work for the top of the range, and the median is smaller than the
dot it would have to escape. Both attempts were reasoning about visibility in the abstract when the
pixel arithmetic was one division away, and both were removed.

**What the finding actually implies.** A 15km fact cannot be drawn at map scale, so if it is to be
drawn it needs its own scale: an inset in the panel with the two epicentres and a stated separation, the
spatial counterpart of the sequence strip that already sits there for time. That is a labelled zoom,
which is honest in the way exaggerating a line on the map would not be. Not built. The panel's sentence
is still the only place the disagreement is stated, and it may well be the right medium for it.

## The second front, and the gap that is the actual measurement

One ring said "energy is spreading from here", which is true and is the uninteresting half. The gap
between a P arrival and an S arrival is how distance to an epicentre is measured: it is the first thing
a seismogram is read for, this app is named after the P arrival, and it carried the machinery for the
whole thing and drew one circle.

So each front is two circles now, on one clock. `S_WAVE_KM_PER_S` is 3.5 against the P's 6, which is
the ordinary crustal ratio and close to the root three an elastic solid with a Poisson ratio of a
quarter gives, so it is the textbook figure rather than a tuned one. `S_OVER_P` is derived from the two
velocities rather than written as 0.583, for the reason the P rate is derived: a constant typed in is a
constant that survives a change to its inputs without anyone noticing.

**The visibility was computed before anything was built, which is new here.** At the end of a front's
life the P ring is at 17 degrees and the S at 9.9, a gap of 7.08 degrees of arc. The globe projects to
roughly 392px of radius at the default framing, so a degree is 6.8px and the gap is about 48px, and
some 37px even on the whole-world map. The item immediately before this one died at 4px after being
built twice, so the division came first this time and is now an assertion rather than a paragraph.

**Both fronts end together, and the S is cut short to make that true.** It is still travelling when the
P reaches `MAX_DEG`. Letting it run its own course leaves a lone circle expanding for eleven seconds
with nothing to be the second half of, which reads as a new earthquake rather than as the tail of an
old one. One event is one mark.

The S circle is drawn lighter, and that is grouping rather than physics: an S arrival is usually the
larger of the two on a seismogram. Two circles of equal weight leaving one point read as two
earthquakes in the same place, which is the opposite of the thing being shown.

**A test that had stopped describing its own invariant.** The capacity check read `64 * 96 * 2`, which
is fronts times segments times vertices, and in doing so also encoded "one circle per front". Adding
the second front made it fail while nothing had overrun anything. It asks the geometry how much room it
has now, so the next change to what a front draws cannot break it for the wrong reason.

The legend sentence changed with the mark, and so did the comment on its glyph: two concentric circles
were drawn there to suggest expansion, and they are now literally the two fronts.

## The app never said what it was called

`First Motion` is a term of art. It is the initial polarity of a P arrival, which is a fine name for
this app and a meaningless one to anybody who has not read a seismogram, and nothing anywhere in the
interface said so.

It could not have been written until the previous change. First motion is a property of the P arrival,
and before the second ring there was no P wave anywhere on screen for the name to point at, so a
definition would have been trivia sitting next to marks that had nothing to do with it. Now the legend
names that front two lines above, and the explanation is a footnote to something the reader is looking
at.

Which is also why it is indented under the rings row with no glyph of its own. It is the one line in
the legend that explains a word rather than a mark, and giving it a swatch would make it a sixth thing
to hunt for on the map.

**The arrival state was the other candidate and lost.** "Asking USGS and EMSC for the last day" is on
screen exactly when a first-time viewer is waiting with nothing to do, which is better timing than the
legend will ever have. It is also on screen only then: the explanation would be available once, to
people who happened to be watching a cold load, and never again to anybody who wondered later.

## Omori's law, drawn without being fitted

Aftershock rate decays as one over the time since the mainshock, so the cumulative count is a
logarithm: steep, then almost flat. The sequence strip already held every neighbour as a tick in time,
which put the app one curve away from showing whether a real sequence does that. A swarm climbs in a
straight line, and that is the more interesting outcome of the two.

**A reference curve and never a fit, and this file decided that before I did.** `Sequence.tsx` already
refuses to call an event an aftershock, on the grounds that the judgement depends on things no keyless
feed carries. A fitted exponent would be the same overreach with a decimal point on it: `p` from a
dozen arrivals is governed by noise, and printing it would be analysis in the sense of looking like
analysis. So the law is drawn at its textbook exponent of 1, with `c` stated at six minutes, scaled to
finish on the observed total. What is compared is where the events bunch, not how many there were,
because productivity is not the question.

**Cumulative rather than a rate.** A rate needs bins, bin width is a free parameter nobody chose, and
at these counts the choice decides the answer. A cumulative curve has no bins: it is the data, and the
comparison is one shape against another.

**The separation was computed before the plot was drawn.** Over a twelve hour span the law is 86 percent
complete at the halfway mark, against 50 for a straight line, which is ten pixels of daylight in a 28
pixel plot, and a third of the height even at a two hour span. That is an assertion in `omori.test.ts`
rather than a sentence here, because the previous item that skipped this step was built twice and
thrown away twice.

**Its own strip, sharing only the x axis.** The ticks already use height for magnitude; a count drawn
in the same box would be a second meaning on one axis with nothing to say which height a reader is
looking at. Stacked, the bunching in the ticks and the steepness in the curve are the same fact twice,
which is what makes them worth putting next to each other.

**A staircase, and the doubling is tested rather than trusted.** The count does not change between
arrivals, so a line sloping through the gap would claim events at times nothing happened, which is the
one thing a cumulative plot exists to make unsayable. Building those two-points-per-step lives in
`omori.ts` rather than in the component, because it is the part that can be wrong and a component
cannot be asked about it without a DOM. One `NaN` voids an entire `points` string rather than one
vertex of it, so a finiteness check over both lines stands in for looking at the plot.

## When it reached the nearest place with a name

A marker says an earthquake happened at a point. It does not say the point is 7km from a town that felt
it two seconds later, and that second fact is the one that makes an event something which happened to
people rather than a dot in a margin.

**The obvious build was the wrong one.** Arrival times need a place and a distance, so the instinct is
an authored list of cities with coordinates, like `REGIONS`. That means writing latitudes from memory
and then making confident claims about real towns from them, and a tenth of a degree of drift is 11km,
which is two seconds of an answer that reads as measured. USGS already writes "38 km NW of Stanton,
Texas" on every event, so the settlement and its distance arrive with the data. All five events in a
sample hour matched that form. Nothing here is authored, so nothing here can be quietly wrong about a
real place.

An event whose agencies named only a region gets no sentence. EMSC writes Flynn regions and USGS writes
some of its own, and a region has no distance in it; deriving one from a centroid would be the authored
coordinate straight back again.

**The path is the hypotenuse, which is the part worth getting right.** The published distance is
epicentral, measured across the surface, and the wave leaves from depth. A 45km-deep event 40km away is
60km of rock, so ignoring depth understates the arrival by a third on exactly the deep events where it
matters most. A missing depth counts as the surface, which follows the decision the event layer already
made and documented for its markers.

**Capped at 700km rather than approximated past it.** Constant velocity holds while the path stays in
the crust and upper mantle. Further out the wave dives into faster material and arrives before six
kilometres a second would say, so the number would read as measured and be wrong. The distance is to the
nearest named settlement, so nothing common approaches the cap: it is a backstop, not a limit anybody
meets.

**Whole seconds, and "under a second" rather than zero.** The distance is published to the kilometre,
which is already 0.17 seconds of the answer, and the origin time it is measured from is an agency's
estimate. A decimal would be precision the inputs cannot support, and the app's own `ago` note says as
much about relative times.

## The file boundary that a prop had been papering over

Adding arrival times meant the panel needed the wave velocities, which lived in `globe/rings.ts` next to
the ring rate they derive. That module imports three, and the panel is in the eager bundle behind a
`lazy` canvas, so the import dragged a renderer in for two floats.

The legend had hit this before and taken the multiplier as a prop to dodge it. That worked, and it was a
workaround for a boundary in the wrong place: velocities are facts about rock, not about rendering. They
are in `geo/waves.ts` now, with the playback multiplier, which the legend prints and which has no
business living beside a shader either. The prop is gone, three consumers import the physics directly,
and the ring layer re-exports rather than redefining so there is still one source for each number.

**The bundle argument for it was wrong, and the split is still right.** `globe/ramp.ts` imports three for
its `DataTexture`, and the legend imports `rampColorAt` from it, so three has been in the eager bundle the
whole time and nothing I did here changed that. The boundary holds on its own terms: a velocity is a fact
about rock and does not belong beside a shader. But the claim that moving it kept a renderer out of the
eager bundle was never true, and a decision log is only worth reading if its reasons are checkable.
Getting three out would mean splitting `ramp.ts` into its colour maths and its texture, which is unbuilt
and unmeasured.

## The terminator already knew what time it was there

`subsolarPoint` is computed every minute to light the globe and it answers a second question for free:
what the sky was doing over the epicentre when the rupture happened. An M6 at three in the morning, with
everyone asleep and indoors, is a different event from the same rupture at three in the afternoon, and
the app held the arithmetic to say so and never said it.

**Solar time rather than clock time, and that is the keyless answer rather than a lazy one.** Civil time
needs timezone boundaries, which is a dataset or a service, and this project renders its first frame for
anyone who clones it. Solar time needs the sun, which is already here. It is also the better quantity for
the question being asked: what matters is where the sun stood, not which side of a political line the
epicentre fell on. Labelled "solar" so nobody reads it as what a watch there would have said.

**Apparent, not mean.** `subsolarPoint` already carries the equation of time, which its own note says is
worth up to a quarter of an hour, so anchoring on the true subsolar longitude costs nothing and dropping
it would reintroduce an error the terminator had already paid to remove.

**Daylight comes off elevation, never off the hour.** Inside the Arctic circle at midsummer, three in the
morning is broad daylight for weeks, and a band read from the clock would say the exact opposite. The
zenith angle is one spherical cosine from the subsolar point, so elevation is nearly free, and the
twilight boundary is the same six degrees the night shader spreads its terminator over. The words in the
panel and the band on the globe therefore agree by construction rather than by coincidence.

**Computed at the event's own origin time, not at `now`.** The panel re-renders with the clock, so
reading the current time would silently answer "what is the sky doing there at this moment", which is a
fact about nothing.

**A test whose geometry was wrong while the formula was right.** I asserted that ninety degrees of
longitude from the subsolar point at the subsolar latitude is the horizon. It is `asin(sin squared dec)`,
0.08 degrees in March and zero only at an equinox. On the equator a quarter turn of longitude really is a
quarter turn of arc for any declination, which is the case worth asserting, and both versions are in the
test so the next reader does not rediscover it.

## A dial that is worth drawing because it shows nothing

Almost everything anybody counts has a time of day in it: traffic, births, crime, power draw, calls to a
helpdesk. Earthquakes do not. The Earth does not know what time it is, and a dial that comes out flat
says so more convincingly than a sentence claiming it, because the reader watches the null result fail
to appear.

**Local solar time, which is why it was built second.** A real diurnal signal would be sun-driven, so
binning on UTC would smear it across every longitude and flatten it by construction: the dial would come
out flat whether or not anything was there, which is the one outcome that would make it worthless. The
solar time work of the previous item exists for this.

**Two numbers computed before the chart, and both changed it.**

The first was cost. A solar hour per event means `subsolarPoint` per event, and the buffer holds 50,000.
Measured at 10.8ms, which is the same order as the histogram walk already running on those triggers, so
it needs no cache. It needs no cache in a stronger sense too: caching by UTC minute measured 14.1ms,
*slower*, because at a month's window almost every event falls in a minute of its own and the map is
pure overhead. The obvious optimisation was a pessimisation and only the benchmark said so.

The second was the scatter, and it decided what the radius means. Counting 400 events into 24 bins gives
17 apiece and a Poisson width of 4, which is 25 percent; at a month it is 4.5 percent. So two things
follow. The expected scatter is drawn as a band, because bars wobbling by a quarter look exactly like a
signal to anybody not holding that arithmetic, and a narrow window then announces its own weakness by
having a wide band. And the radius carries the departure in sigmas rather than the count, because from
zero a month's 4.5 percent variation is under two pixels on a forty pixel bar: the dial would read as a
smooth ring whether the data were flat or carried a ten percent signal. A chart that cannot show the
thing it is denying is decoration.

**No verdict.** `Sequence.tsx` refuses to call an event an aftershock because the judgement is the
reader's, and here the same restraint has a statistical trap behind it: across 24 bins roughly one will
stray past two sigma by luck alone, so an app declaring "no signal" off that threshold would be wrong
about a third of the time. It draws the bars and the band.

**Behind a disclosure**, because the payload is interesting once and is not something anybody monitors,
and the rail's permanent space belongs to what changes. Under the activity strip, since both answer
"when" and neither answers it the other's way: elapsed time there, time of day here.

**A filename that would have broken on a case-sensitive disk.** `diurnal.ts` beside `Diurnal.tsx`
differs only in casing, which macOS tolerates and CI would not. The house convention was already the
answer and I had walked past it: the pure module is named for the computation and the component for the
artefact, as in `histogram.ts` with `Timeline.tsx` and `nearby.ts` with `Sequence.tsx`. It is `Dial.tsx`.

## What that magnitude actually meant

The rail has named the largest event in the window for a long time and the number said nothing to anybody
who does not already know what a magnitude is. Magnitude is logarithmic, two points of it is a
thousandfold of energy, and almost nobody carries that around.

**The comparison is against everything else on screen, because that is where the log scale lands.** One
M6.4 against four hundred events near M2.5 is better than 99.9 percent of the energy released in the
window. A reader who has just scrolled a list of four hundred rows and is told that one line of it is
99.9 percent of the energy has learned the scale in a way no worked example does.

The sentence is suppressed below a half share. A window with no dominant event splits its energy, the
number comes out near a third, and there is nothing to teach: the fact only teaches when it is extreme.

**Proportional energy, not joules.** The Gutenberg-Richter relation is log E = 1.5M + 4.8 for joules, and
the constant is dropped because every use here is a ratio, where it cancels. Keeping it would print
something like 4e9 joules, which reads as a measurement of one earthquake's energy budget when radiated
energy from a magnitude is an estimate with a wide error bar.

**99.94 does not print as 100.** The remainder is not nothing, it is four hundred events, so anything past
99.9 reads "over 99.9%" rather than rounding to a whole truth the number does not have. A decimal is kept
only while it is doing work, and below 99 it rounds to whole percent.

**Carried by the walk that already found the winner.** `histogram` visits every event on every revision,
and the share needs a sum over all of them, so a separate pass would be a second sweep for one division.
The top magnitude is tracked beside the winning event rather than read back off it afterwards, which is
also the only thing TypeScript permits: it cannot see that the callback ran, so it narrows the variable to
`null` and the dereference is an error rather than a risk.

## Measuring between two events, with nothing added to do it

The panel lists neighbours with their distances, inside 150km, for whatever is pinned. What it could not
answer is how far apart any two events on screen are, which is the difference between a display and an
instrument.

**No mode, no second selection, no state.** An event is already pinnable and another is already
hoverable, so the pair exists the moment somebody has done both. The measurement is those two facts read
together. The alternative was a measure mode with an entry, an exit, a second selection to hold and a way
to see which of two things was selected, all to express a relationship the app was already one
subtraction away from.

**Distance always, time only inside the cap.** Distance is geometry and true at any separation. A travel
time over a constant crustal velocity stops being true well before the antipode, so it is refused past
the same `MAX_KM` the arrival sentence uses. One cap, one reason, one place to change it.

**Depth is deliberately absent, having been deliberately present next door.** The arrival sentence
corrects for it because a wave leaves a hypocentre for a point on the surface and the correction is worth
a third on a deep event. Between two events both ends are hypocentres, and the honest path is neither the
surface arc nor the straight chord but a refracted ray, so the surface distance is reported as exactly
what it is.

**The tooltip was clipping the line before it was written.** `truncate` sat on the tooltip box, which
means one line, so a second line would have existed and never shown. It has moved onto the place name
inside, which is the thing that actually wants truncating: a place name is prose and a measurement is not.

**And a formatter that was about to exist twice.** `globe/scale.ts` had `distanceLabel` for the scale bar
and this needed the same words, differing only in rounding and a guard, which is how "500 m" and "0.5 km"
end up in one app. There is one now, in `format.ts`, whose whole job is turning data into words, and the
scale bar reads it from there.

## The dual-source architecture, as two bars instead of two numbers

The source toggles have carried each feed's reach as a duration since the EMSC debt was paid: "USGS 24h"
and "EMSC 6h". That is the right fact and the wrong form. Reading "6h" against "30d" and arriving at a
fortieth is arithmetic the reader has to do, and a fortieth drawn against a full bar is instant.

So each feed's reach is a fill on a hairline, and the fills are anchored right because coverage reaches
back from now. Widening the window widens one bar and leaves the other where it was, because the
catalogue returns its most recent page whatever is asked of it, and that is the dual-source architecture
made visible rather than described.

**Drawn under the activity strip, not under the buttons where the numbers were.** A bar needs an axis to
be read against, and that strip's axis already *is* the window, labelled at both ends, with blocks on it
that already mean "not covered". Putting a second axis two blocks away would be the same span measured
twice.

**Which is also why the durations came off the buttons.** With the bars carrying the words *and* the
proportion *and* an axis, the chips beside the toggle labels were the same span printed twice in one
rail, which is precisely the fault this file recorded when the activity axis carried "last N hours"
beside a headline printing it. The toggles are toggles now, and their `aria-label` went back to the
source name because the strip states the reach in text of its own.

**The caveat moved with the picture.** "EMSC returns its most recent page whatever the window" was
written beside the buttons, two blocks from the asymmetry it explains. It sits under the bars now.

**The pre-check that mattered.** At a month, eighteen hours is a fortieth of the axis, which on a 316px
rail strip is eight pixels. That is small enough to be worth checking and large enough to read, and the
stub against a full bar is the fact being stated loudly rather than a rendering failure. A minimum of one
percent keeps a real but tiny reach from rounding away to nothing at all, which would say "no backlog"
about a feed that has one.

## The same two bars, a second earlier

The reach bars appeared once a feed had vouched for something, which meant the first second of the app
said the dual-source architecture in prose and nothing else: "Asking USGS and EMSC for the last day."

They are on screen from the first frame now, both tracks empty, each filling when its own feed answers.
The headline says the app is asking two agencies; the tracks say which of them has replied. That is the
project's thesis legible in the first second rather than a moment later, and it costs nothing, because
the load state and the steady state are now one visual instead of a wait followed by a chart.

**Three states, not two.** `reach` answers "no backlog" for a feed that has not delivered one, which
describes a feed that refused exactly as it describes a feed still being waited for. Those resolve
differently: one fixes itself and the other does not, and the whole point of drawing two bars is seeing
which feed is carrying the window. So the words are "waiting", "no answer", or the reach.

A feed that seeded and then lost its socket keeps its reach rather than reverting to a failure. The
backlog it delivered is still real, and the failing notice in the rail already says the live half is
gone.

**No fake progress.** The obvious reading of "two fills on one hairline" is a progress bar, and there is
nothing to be a fraction of: the size of a backlog is unknown until it arrives. So a track is empty or it
carries a reach, and the fill means coverage rather than completion.

## The count moved for three reasons and only one of them looked like anything

The rail has a single focal point and it is the count. The entrance replay already climbs it, because the
replay drives it a frame at a time, so that moment was solved by accident. A live arrival snapped it by
one, and widening the window snapped it from 872 to 11,363: the largest single change of state the app
makes, rendered as a flicker.

**Only ever on a discrete change, and that is the constraint the whole thing turns on.** A rolling
readout eases toward a target, so pointing one at a continuously moving source makes it a permanently
*late* reading rather than a smooth one. The cursor drives this count frame by frame while it is parked
or playing, and the replay does the same on the way in. In both cases the number has to be exactly what
is drawn, so the hook is handed that fact rather than inferring it: from the value alone, a frame of a
smooth drive and a discrete jump are indistinguishable.

**The rate is solved, not chosen.** Time to land is `tau * ln(gap / 0.5)`, so the largest change in the
app is about ten time constants. My first guess of 120ms measured at 1,194ms for that jump, which is a
second of digits still turning: a readout arguing with itself. 55ms puts it at 547ms and a single arrival
at 38ms, which is a snap, and that is correct too. Both numbers are assertions in the test rather than
prose here, so it cannot drift back to a constant that feels right and measures wrong.

**Rounded on the way out, never on the way through.** Rounding the state would quantise the approach into
whole units, and any frame moving it less than half a unit would then move it not at all, which stalls
the roll near its target forever.

Reduced motion skips rather than shortens, the rule the camera and the entrance both follow. So does the
first value it ever sees: easing up from zero on load would invent a count-up the data never did, and the
entrance replay already owns that moment.

## Why this and not the two items above it in the backlog

Plate motion vectors and the quiet map were next, and both want data this repo does not have: Euler poles
for the first, craton outlines for the second. Neither has a keyless source, so both mean committing
figures written from memory into an app whose argument is that its numbers trace to something. Getting a
pole slightly wrong does not look wrong; it looks like physics.

This was picked over them deliberately. The worst case here is that the timing feels off, which is visible
in a second and adjustable in one line, and the numbers behind it are derived rather than remembered.
The other two stay unbuilt until somebody chooses to bring real data in.

## A seam audit that found nothing, and the two things it corrected on the way

The land mesh was wrong at the antimeridian three times, and its test file says outright that it "had a
real problem to fix, rather than a precaution". The plate boundaries and the graticule cross the same
line and run into the same poles, and between them had no geometry test at all: `plates.test.ts` covered
the reveal ordering and nothing else, and the graticule had no test of any kind.

**All three are correct.** That is the result, and it is worth as much as a fix would have been, because
the alternative was believing it.

- **Plates.** 2,479 segments, every vertex on its sphere, every `aLonLat` agreeing with its position, no
  segment spanning more than 1.6 degrees of arc, no NaN. The widest longitude gap in the data is 18.3
  degrees at latitude 85.8, which is 1.34 degrees of *arc*, so the densifier is right to leave it as one
  segment: sag depends on arc and not on longitude, and splitting polar segments on longitude would cost
  twelve times the vertices for nothing.
- **Graticule.** Meridians reach both poles, parallels stop at 75, nothing spans more than three degrees
  in either axis. The antimeridian is drawn once and not twice, which is a deliberate asymmetry: on the
  globe -180 and +180 are one line, and on the map the repeats put the next copy's -180 exactly where this
  copy's +180 is.
- **Markers.** A point has no geometry to be wrong at a seam. The grid deciding whether two are one does,
  and the Ring of Fire crosses 180 twice, at Tonga and along the Aleutians.

**Two corrections, both mine, both mid-audit.** I measured two events either side of the date line landing
in different cells and read it as the bug. It is not: two events either side of *any* cell edge land in
different cells, because that is what a grid is. The measurement that actually settles it is the merge rate
of a fixed-separation pair slid across a region, which came out at 90.0 percent straddling 180 against 90.0
percent mid-Pacific. And a figure of "85 positions where the seam splits a pair that merges elsewhere" was
meaningless, because it compared two different cell-edge phases.

The one genuinely seam-specific thing is that 360 degrees is not a whole number of widened cells, so the
band at the antimeridian is a runt: 3.344 degrees against 3.365 at latitude -18. Six parts in a thousand.
It has an assertion now, not because it matters but so that a change to the widening cannot make it matter.

**`buildPlates` takes its data as an argument now.** No step in the committed simplification comes within
150 degrees of the wrap guard, so the guard was untestable and looked dead. It is not dead: the JSON is a
build artefact of a simplification that could be re-run at a coarser tolerance. It is fed a crossing
directly now, because a precaution nothing exercises is a precaution somebody deletes.

## A link that threw away the month it was pointing at

Looking for the cursor in the permalink turned up something worse next to it. The decoder read
`clamp(w, 1, 24)`, which was correct while a day was the only window and silently wrong from the moment
7d and 30d shipped: a link to a month arrived as a day. Not refused, not widened, not mentioned. That is
the worst of the three possible outcomes, in the feature this file's own header calls the highest-leverage
item in the source doc.

Nothing caught it because the permalink tests asserted the two directions separately and never a round
trip through a window other than a day. There is one now, over all three.

**Snapped to an offered window rather than clamped to a wider bound.** The rule at the top of `decode`
says a link must not leave the app in a state it has no other way to reach, and a 100-hour window is
exactly that: it works arithmetically, the strip divides it happily, and the window buttons would show
nothing selected with no way back to what the link asked for. Nearest in log space, because these are
multiples and not an interval: 100 hours is 4.2 days and 0.6 weeks, and linear distance would call the
day nearer when proportionally the week is.

`WINDOWS` moved out of `Timeline.tsx` to make that possible. It lived beside the buttons, so the decoder
had no way to know what a valid window was, which is how it came to hardcode one.

## And the cursor, which is what I went in for

The camera travelled in a link and the clock did not, so "look at this" could say where and never when.
That became a real gap when the largest-event row started parking the cursor: the app's best entry point
put you at a moment and then produced a link that discarded it.

**Absolute, not an offset from now.** The thing being shared is a moment, not a distance from whenever
the recipient opens it. The cost is that it can fall outside their window, which is the cost `event`
already pays, so it is paid the same way: restored when it fits, and said out loud when it does not.
`clampScrub` was already turning an out-of-range cursor into live, so the degradation existed and was
silent; the notice is what makes it honest.

**Seconds, and no playing state.** A cursor is read off a strip 24 buckets wide, so millisecond digits in
a URL are a claim nobody can read. And a link that arrives already playing is motion the recipient did
not ask for, which is the objection DESIGN.md makes to ambient rotation. It arrives held.

Unlike a window, an unreadable moment is dropped rather than snapped: 1970 and the year 5000 are both
simply not what the link meant, and there is no nearest valid moment to move them to.

## Two more bounds restated as literals, from the same audit

The window bug had siblings, and they were found the same way: reading the decoder's clamps against the
controls they are supposed to describe rather than against what looked reasonable when written.

**Magnitude clamped to 0..7 while the slider runs 1 to 7.5.** So a filter parked at the top of the scale
shared as 7.5 and arrived as 7, and a link could ask for 0, which no control can produce. It reads
`MAG_MIN` and `MAG_MAX` now, which is the same fix as the window's: take the bound from the thing being
bounded.

**Zoom clamped to the globe's floor, which is not the map's.** The map derives its own from the zoom at
which the frame is exactly 360 degrees wide, and that is 0.64 at desktop and 0.19 on a phone, both under
the globe's 0.75. Every fully zoomed-out map view therefore shared as 0.75 and arrived up to four times
tighter, losing "see everywhere at once", which the map's own notes call the only reason to leave the
globe.

That one is not fixed by widening the literal, because the real bound depends on the viewport and the
decoder has no viewport. It does not need one: `flyTo` already runs every shared camera through
`clampZoom` against the live frame. So the decoder rejects nonsense and the contextual limit stays in the
one place that can know it.

**Latitude was already right**, at the camera's own 85, and now has a test saying so. Three clamps
audited, two wrong, and the one that was correct is the one that had been derived from a named constant
rather than typed in.

## "Newest first" was showing events 29 days old

The recent list pools candidates from the store and shows the sixty newest. It pooled the 400 most
recently *arrived* and sorted those by origin time, which is itself a fix for an earlier version of the
same bug: the file's own note records the list once opening on events nineteen hours old.

The fix was the sort, and the pool was left at 400. That was sound while a day's seed was three hundred
events, because the pool then covered the whole window. A month's seed is 10,976, and USGS lists a feed
**newest first**, so the last four hundred events to arrive from it are its four hundred *oldest*.

Measured against the live month feed rather than reasoned about. At a 30-day window the sixty rows under
a heading reading "newest first" spanned **28.8 to 28.9 days old**, where the true newest sixty spanned
the last 7.4 hours. The hourly poll pushes a dozen genuinely recent events in behind the seed, so the top
of the list looked plausible and then fell off a cliff, which is why nobody caught it by looking.

**The same class as the permalink clamps, and the third one this week.** A bound that was correct when
written, invalidated by a later change elsewhere, silent about it, and only visible in the state that
shipped afterwards. The day window never showed it. The one that shipped later did.

**The store selects instead, and takes the filter.** `newest(n, keep)` walks the ring once and keeps a
bounded insertion of the best n by origin time, which is the idiom `nearby.ts` already uses for its four
notable neighbours and for the same reason: sorting the buffer to take sixty is O(n log n) for a
fixed-size answer, and the buffer is fifty thousand events on every revision.

The filter is an argument rather than something applied to the result, because filtering after a cap
cannot be made correct: it returns however many of the top sixty happen to pass, which is fewer than
sixty and sometimes none. There is a test where every recent event is excluded and the right answer is an
hour further back.

`latest` stays, with its documentation rewritten to say what it actually orders by. It is arrival order,
which is the right thing for eviction and nobody's idea of "recent".

## The one interface that speaks was announcing the backlog

The live region announced anything above the viewer's threshold that it had not already seen in the list,
and read "I have not seen this" as "this just happened". Those are different claims and the second was
false twice over.

**On every cold load.** The list goes from empty to sixty events at once and every one of them is unseen,
so a screen reader was told "3 new earthquakes above magnitude 4.5" about a backlog hours old. This is the
exact mistake the wavefront layer has a named guard against, and its comment says so in as many words: the
seed creates hundreds of quakes at once and none of them just happened. The canvas knew. The interface
that talks did not, which is the wrong way round for the two of them to differ.

**And whenever the magnitude filter is lowered.** That admits events which were always held and never
listed, and they arrive looking exactly as unseen as a genuine arrival does.

**So news is decided by the clock, not by what has been on screen.** An earthquake reported forty minutes
ago is not news whatever the interface happens to have been showing, and one reported two minutes ago is
news even on the first frame after a load. That single condition covers both failures, where a flag for
"this is the first delivery" would have covered only the first and needed a second flag for the filter.

The window is thirty minutes and the trade is explicit. Agencies publish within a few minutes for
anything large and up to fifteen or so for the rest, so the window has to be wider than the delay or real
arrivals go unannounced; it is far short of a seed, whose events run to hours and days. An event published
unusually late therefore passes in silence, which is the recoverable direction. The other one floods
somebody's screen reader every time they open the page.

The seen set stays, because a re-render is not an event.

**Nothing in the browser suite touched this.** The live region has no test at all, in either suite, which
is how a fault this loud stayed quiet: it is the one part of the app that is invisible to anybody not
using it. The rule is a pure function now, tested directly, which is the most that can be checked without
a screen reader in the loop.

## Fixing the window clamp armed a firework

Last change let a link carry a 7d or 30d window, which had been silently flattened to a day since those
windows shipped. That was the right fix and it made a latent bug reachable, which is worth writing down as
plainly as the fix was: the entrance replay played from the oldest event in the buffer, and while a day
was the only window that phrase meant "a day ago".

Measured against the real month feed rather than reasoned about. Thirty days holds 215 events at magnitude
5 or above, and the entrance plays in 2.8 seconds, so a link opening at a month fired **77 fronts a
second**. `REPLAY_FRONT_MIN_MAG` is documented as chosen for a rhythm of roughly three a second, by a
comment that calls six "a firework". `MAX_RINGS` is 64, so most of them were dropped before anyone could
have seen them, which is the only reason this would have looked merely wrong rather than broken.

**The replay reaches back a day, whatever is held.** Not an arbitrary rescue: a day is what the module is
named for and what the rail says out loud while it runs, and that label was hardcoded, so at a month it
was also lying. At a wider window the older events are simply already drawn when the entrance starts,
which is true to the claim being made, since the entrance is about showing what the globe *does* rather
than inventorying what it holds. A day's window is unaffected, because there the buffer's oldest event is
already the later of the two.

**And the count had to be primed, which is the same fault in the other direction.** `revealed` counts what
the replay crosses. With the start clamped, everything older than a day is on screen from the first frame,
so leaving the counter at zero would have printed 285 in the rail beside a globe holding eleven thousand.
The first-frame announcement had the same two stale values in it, on a line whose own comment exists to
say the heading and the picture must agree from the first frame.

That is the fifth of these in five changes, and the first one I caused. The class is unchanged: a constant
or a phrase that was true when written, made false by something else moving, and silent about it.

## An hour that was a bucket, until a bucket stopped being an hour

Holding a bar on the activity strip lights the events it stands for. It lit the wrong ones at two of the
three windows, and at the widest it lit nothing at all.

The strip hands over the bar's **index**, and the marker layer turned that into a time range by
multiplying by a hardcoded `3_600_000`. A bucket is `windowMs / 24`, so the two agree exactly at a
24-hour window and nowhere else: seven hours at a week, thirty at a month. Hovering bar 5 of a 30-day
strip asked for events five to six hours old instead of a hundred and fifty to a hundred and eighty, so
every bar on the strip asked about the same recent hour whichever one the pointer was on. With one event
per bucket, nothing at all falls in that hour, so the feature was not merely wrong at a month, it was
silent.

**The fix removes the units from the layer rather than correcting them.** It takes a span now. The strip
knows how wide its own buckets are, because `bucketMs` comes from the histogram that drew the bars, and
the marker layer has no business knowing. A conversion that happens once, where the width lives, cannot
disagree with itself twice.

The strip keeps the index for its own highlighting, which is correct: comparing a bar to the held bar is
exactly what an index is for.

**Why nothing caught it.** There is a browser test for holding a bucket, and it runs at the default
window, where the hour and the bucket are the same number. The new test runs the same assertion at all
three windows and reads `aFocus` off the geometry, so a bar that lights nothing fails instead of looking
like a quiet hour. It also asserts that two different bars light two different events, which is the thing
that was actually broken, rather than that one bar lights one event, which always worked.

Sixth of these, and the same shape as the other five: a constant that was true when written, made false
by something else moving, silent about it, and invisible in the state that existed at the time.

## The header's `both` count had the wrong denominator by fifty-five times

The header prints four bare numbers, and one of them is `both`: how many events came from both agencies.
A bare count invites the nearest total as its denominator, and the nearest total is the window's.

Measured against the live feeds. EMSC's seed reaches back 20.6 hours whatever window is asked for, so at
thirty days corroboration reads as **0.9 percent** of 10,976 events, and inside the span both agencies
actually looked at it is **49.5 percent** of 202. The subject of this entire project is two agencies
reporting one earthquake, and its own headline number was understating that by a factor of fifty-five.

F's original note said as much and I only fixed half of it: the reach bars explain that the feeds cover
different spans, and nothing said what that does to the count sitting in the header.

**The rate is stated where it is true**, under the bars that show the asymmetry, with the denominator in
it: "Both feeds only overlap for the last 21h. Inside it, 100 of 202 events (50%) were reported by both."
The header keeps its raw count, which is not wrong, only unqualified.

**The overlap is the later of the two edges, not the earlier.** `coveredSince` is a min, because that is
the honest left edge of what the app holds at all. A corroboration rate needs the opposite: neither agency
can confirm the other outside the span where both were looking.

Suppressed when the overlap is the whole window, because then the header's count already has the right
denominator beside it and this would be one fact printed twice. Reported when it is zero, because two
agencies watching the same hours and matching nothing is the interesting failure rather than an absence.

## And a claim about a window that had not arrived

Found by looking at the running app rather than by reading. At a thirty-day window with only the hourly
poll in, the rail printed "That one event is 86% of the energy released in the window" directly beneath
"Asking USGS and EMSC for the last day": a share of thirty days computed from one hour of it.

The share is a fact about a window, and until the backlog lands there is no window to have a share of. It
waits for `edge.complete` now, which is the same flag the headline beside it already uses to say "still
filling", so the app knew and this block was not asking.

Worth recording how it surfaced. The tab had `w=720` in its hash from an earlier click, so reloading came
back at a month and spent a minute fetching a five-megabyte feed, which is a state that barely exists at a
day and lasts long enough to read at a month. Every fix that widens what is reachable makes the next one
visible.

## Everything Is Fine

The app is called Everything Is Fine. It was called First Motion, after the initial polarity of a P-wave
arrival, which is a good name for a seismic instrument and cannot carry hurricanes, wildfires, floods and
an aurora. The scope decision came first and the name followed it; both are recorded in `PLAN.local.md`
section I, including the recommendation they overruled.

The joke is deadpan and it plays *against* the chrome rather than with it. A hue-free instrument laying
out counts in tabular figures, under a headline saying everything is fine, is funnier than any amount of
colour would be. That is also the discipline it imposes: the app has to stay austere for the name to
work, so the name is now an argument against the layer menu section I warned about.

**"FINE" on a phone.** The wordmark is half again as long as the one it replaces, and this header's own
notes record a single extra button pushing it 120 pixels past a phone viewport. So it is "FINE" below `md`
and the full sentence above it, which is a layout fix and the better joke at that size.

**Ten string literals became one prefix, because the rename had a consequence nobody would have chosen.**
Preferences were keyed `firstmotion.rail`, `firstmotion.ramp` and so on, written out at each of the ten
places one is read or written. Renaming those keys silently returns every returning viewer's rail width,
projection, ramp and announce threshold to defaults, because the new keys are simply absent. `stored`
reads the new key, falls back to the old one once, and writes the new one on the way past, so a
preference migrates the first time its owner opens the page. It also swallows the exception private
browsing throws, which the ten inline calls did not: a preference that cannot be saved is not worth
taking a page down for.

**One feature died in the rename, and it should.** The legend carried "First motion is a seismogram term:
which way the ground jumps as that P wave lands", added a few changes ago because nothing in the app said
what its own name meant. With the name gone that line explains nothing, and a fact kept only because it
was once load-bearing is trivia. It is removed. The two-ring sentence above it stays, because the P and S
fronts are still drawn and the gap between them still measures distance.

**The share card is now wrong and cannot be fixed from here.** `public/share.png` has the old wordmark
baked into it. `pnpm card` regenerates it and needs a browser.

## The aurora, and the line that decides every layer after it

First layer that is not an earthquake, and chosen first because it is the only one that is not more dots.
It is a field, so it draws as light rather than as another marker competing with the ones already there.

**The hue question, settled: light gets colour, marks get shapes.** The rule was never "no hue in the
canvas". The atmospheric rim is already blue and the day wash already pale blue-grey, because both are
illumination. An aurora is illumination too, so it joins those rather than the magnitude ramp, and the
rule survives exactly as written: no *mark* carries a hue that is not a magnitude. That draws the line for
everything queued behind it. Hurricanes, floods and wildfires are marks, so they stay achromatic and
differ by shape, which matters most for wildfires, whose obvious orange *is* the ramp.

**Drawn inside the night shader, not beside it.** That shader already computes how dark a point is, from
the real subsolar position, so the aurora is multiplied by the number that already exists. Not a stylistic
choice: an aurora is there in daylight and you cannot see it, and drawing it anyway would be the same kind
of unstated claim as a wavefront moving at a speed nothing prints. It also means the layer arrives with its
explanation already on screen, which is the rule `PLAN.local.md` now holds every new layer to.

**The gain is measured, not chosen.** Probability is multiplied by three before clamping, because an
ordinary active evening peaked at 28 out of 100 and dividing by the model's nominal maximum would have
drawn every real night as almost nothing. The legend states the peak for the same reason: a quiet sky is
genuinely faint, and a faint wash with nothing saying so is indistinguishable from a layer that failed.

**Not a `GeoEventSource`, and that is the whole cost of going beyond earthquakes done cheaply.** That
contract is built around readings a second agency might dispute. A probability field has no identity to
reconcile, no magnitude and no depth. Section I says the store is the earthquake-shaped part and the
sources are not, and the way to keep that true is to not push a field through a reconciler. It is fetched
beside the feeds, held in one piece of state, and handed to the scene as a texture.

Ten minutes rather than the model's five: the grid is 900kB and an oval does not move far in that time.

**Two things I walked into.** A backtick inside the GLSL comment ended the shader's template literal, which
`morph.ts` warns about in as many words. And the texture is RGBA rather than a single red channel, four
times the bytes for 260kB, because `ramp.ts` already proves that exact path works here and a one-channel
texture brings row-alignment rules that are only interesting when they are wrong.

**Unverified:** whether the field reads as smooth or as a one-degree mosaic at high zoom. `LinearFilter` is
the mitigation and the wash looks diffuse at framing distance, but I have not looked at it magnified.

## Cyclones, as tracks, with 92% of the payload left on the server

A storm drawn as a point is a dot that happens to be a hurricane. Drawn as a track it explains itself: the
measured track of SAUDEL-26 runs from 7.9 to 26.5 degrees of latitude while moving west, which is the
poleward curve every cyclone makes and the reason none of them form on the equator. That is the geography
this layer arrives with, and the rule set with the aurora is that no layer ships without one.

**Three of ninety-nine.** GDACS lists 99 cyclones and flags 3 `iscurrent`. The rest are the season's dead
storms, and drawing them is the EONET mistake again: a map that looks live and is mostly a year old.

**The polygons stay on the server, deliberately.** Each storm's geometry payload is 370kB, of which 49
features are wind-radius rings and a forecast cone and 17 are the track. Section I is explicit that rings
in longitude and latitude walk into all four traps the land mesh paid for in full. The LineStrings are
28kB and are a polyline, which this codebase already draws correctly. Taking the cheap eight percent and
refusing the expensive ninety-two is the whole of the decision, and it is worth writing down because I
told Aiden earlier in the same session that the polygon objection had dissolved. It had not. It dissolved
for the *event list*, which returns centroids, and came straight back the moment I opened the geometry
endpoint.

**Their label contradicts their own number, so the number wins.** `severity` and `severitytext` disagree
systematically: 259 km/h filed as "Tropical Storm", 243 km/h as "Post-tropical Depression". The likeliest
reading is that the number is the peak over the storm's life and the text classifies it now, which is two
true statements about different moments, and exactly the shape of problem this app already exists to
handle. So the number is kept, the category is derived from it with a scale named in the code, and the
text is not printed at all. SAUDEL-26 reads "222 km/h, category 4 at its peak" where GDACS says tropical
storm.

**A mark, so a shape.** The rule settled with the aurora holds: light gets colour, marks get shapes. This
is achromatic and it is a spiral, which is what cartography already uses for a cyclone and which cannot be
confused with a magnitude dot at any size. The legend's swatch is generated by the same function the globe
draws with, so the two cannot drift. Longitude is stretched by `1/cos(lat)` so the spiral stays round away
from the equator, the same correction the clustering grid makes.

## The bug the layer found in the two layers before it

The spirals drew nothing while the legend beside them described four storms, which is a state the app is
not supposed to be able to reach.

Two causes, one mine and one real. The prop went onto `MagnitudeFilter` instead of `Globe`, so the legend
had the data and the scene never did. And underneath that: the effects that hand a grid or a storm list to
the scene fire on their own dependencies, so **a scene built after a fetch has already landed never hears
about it.** The array has not changed, nothing re-runs, and the layer sits empty. That is not only a
hot-reload artefact; any remount of that component has the same hole, and the aurora had it too and would
have shown it the first time a remount happened in front of somebody.

Both layers are now pushed once at setup from the `live` ref that already exists for holding latest props,
as well as on change. The lesson is the one this session keeps relearning: a handoff that only fires on
change is a handoff that assumes it fired first.

## Volcanoes, and the layer that has to admit it is not live

The feed has no "erupting now" in it. GDACS lists 23 volcano events and flags **zero** of them
`iscurrent`; `severity` is 0.0 and `severitytext` empty for every one; the newest episode ended 9 days ago
(Etna), then 15 (Fuego), then 36, and the tail runs past 200. Within the last 7 days: none. The
Smithsonian's weekly report is the feed that would answer this and it fails CORS, so with no Worker there
is no honest live volcano layer to be had at all.

So the layer presents what it has, and the legend leads with the age rather than burying it: *"the
triangles are volcanoes with a logged eruption episode, 23 of them. The newest ended 9 days ago, so none of
this is erupting this minute."* Every other layer here is live and a viewer is entitled to assume this one
is too. What survives dropping the currency claim is the better fact anyway, and it is the one the plan
asked for: they land along the plate boundaries already drawn, which is the same argument the earthquakes
make from the other side. **Alert level is deliberately unread** - an Orange on a 200-day-old episode
describes a concern nobody currently has.

**One triangle per mountain, not per episode.** The list carries Mayon three times and Kanlaon four, one
row per episode, and drawn as published that is four marks on one volcano reading as four volcanoes. Keyed
on name and position, because position is part of the identity: two mountains sharing a name are not a
merge. **Fetched once, not on the ten-minute clock** the aurora and the storms run on - polling a two-year
archive for changes it does not have is traffic spent to learn nothing.

**Zoneless stamps.** GDACS writes `2026-08-11T21:25:00` with no zone and means UTC; the platform reads that
as local time. Left alone every episode moves by the viewer's offset. `"Z"` is appended when no zone is
present, and a volcano with no readable date at all is kept rather than dropped, because it is still a
volcano - it just does not get to set the "newest" line.

## One layer for everything that is not an earthquake

Volcanoes made this the third non-earthquake phenomenon with wildfires and floods queued behind, so the
cyclone layer was generalised before the fourth arrived rather than after. `globe/marks.ts` draws polylines
in longitude and latitude and knows nothing about storms or mountains; `globe/shapes.ts` holds the glyphs
(`spiral`, `volcano`) and knows nothing about feeds; `app/marks.ts` is the one place that knows both and
turns what is happening into what is drawn. The scene's `setCyclones` became `setMarks`.

Four near-identical `LineSegments` layers would be four places to fix the same antimeridian bug, and this
app has already paid for that lesson once in the land mesh. The layer tests written against the cyclone
version were ported rather than dropped - clearing, buffer bounds, finite positions, seam behaviour - which
is what made the move safe to make; they were always the layer's tests and not the cyclone's.

The triangle sits **on** its point rather than centred on it, because centred puts half of every coastal
volcano in the sea, and most of them are coastal. The legend draws both glyphs from the same generators the
globe uses, with latitude negated because SVG counts y downward and the globe counts it up - without that
the volcano points at the ground, which is a different symbol.

## The cap in the middle of the hazard feed

GDACS stops at 100 features and there is no way past it. `limit`, `pagesize`, `count` and `page` are all
ignored and all return exactly 100. What settled it: `country=` **is** honoured, and Angola on its own
returns a full hundred wildfires. So the global wildfire response is a truncated slice of thousands, not a
census.

Two consequences, both structural. **One request per type**, because `eventlist=EQ;TC;FL;VO;DR;WF` returns
100 *total* - measured at 69 wildfires, 25 earthquakes, 4 cyclones and 2 floods - which would silently drop
every volcano and 98% of the floods. And the cap has to be checked per layer rather than assumed away:
volcanoes are 23 and floods spread across 68 countries at no more than three each, so both are complete;
wildfires are not.

## Wildfires, live and countable only to a floor

The unusual combination here is live, complete in its dates, and incomplete in its count.

Live is not in doubt: all 100 are flagged `iscurrent`, every `todate` is today, and the burns run 3 to 15
days with a median of 9. **That duration is what this layer brings that nothing else on the globe does.** An
earthquake is an instant; a fire is a fortnight. Burned area is real too, in hectares, 1,539 to 147,397,
with 16,203 km² alight in total.

The count is the problem, and the alternative was worse. Filtering to Orange;Red gives a *complete* set of
14 - and **all 14 are stale**, ages 3 to 207 days, median 22. So the two properties I wanted sit on
opposite sides of the same switch: the unfiltered set is live and truncated, the filtered set is complete
and dead. Live wins, because a stale fire layer is the volcano problem again and this feed does not need to
have it twice.

So the legend states the floor outright: *"100 of them, 16,203 square kilometres alight, burning 9 days at
the median. The feed stops at 100 and Angola alone has more than that, so the count is a floor: every mark
is real, their number is not the world's."* The caveat clause only renders when `count >= FEED_CAP`, so it
is a fact about this response rather than boilerplate. The country it names is ranked **by burned area, not
by event count** - ranking by count would name whichever country the cap happened to favour.

I considered aggregating to one flame per country to dodge the false density and rejected it: the `country`
field carries composites like "Zambia, The Democratic Republic of Congo" alongside single-country rows, so
13 "countries" is not 13 countries, and the reduction would have been my invention sitting on top of a
truncation. Disclosing the truncation is honest; hiding it behind an aggregate is not. The geography in the
slice is right anyway - Angola, Zambia, the Congo and Siberia genuinely dominate the world's fire count in
late August.

**Area is not encoded in size.** Size belongs to the magnitude ramp, and at true scale the largest fire on
Earth is a fifth of a degree across, which is invisible. The hectares go in words.

## Floods, and the number that does not exist

Straightforward for once: 19 of the 100 are current and every one of those ended within three days; the
other 81 run to 359 days old. Filtered on `iscurrent` like the cyclones, and for the same reason - drawn
whole it would be a flood archive wearing the present tense.

What the layer refuses to do is rate them. GDACS files **every** flood in the list as `severity: 0.0`,
"Magnitude 0", so there is nothing to rank by, and the legend says so rather than leaving a reader to assume
the marks are sized or sorted by anything: *"the mark says where and not how bad."* For a flood, severity is
the number a reader most wants and the one nobody keyless has.

## Four outlines, no hue

The mark vocabulary is now closed: **spiral** storm, **triangle** volcano, **flame** fire, **three wavy
lines** flood, all achromatic, with colour still meaning magnitude and nothing else. That is the aurora's
rule - light gets colour, marks get shapes - holding across five layers, which is what it was written for.

The flame leans, because a symmetrical one reads as a leaf. It stands on its point like the triangle, for
the same coastal reason. A flood is three *separate* strokes rather than one path, because a single
polyline would have to travel from the end of one row to the start of the next and that connector would be
drawn; `waves()` therefore returns `Point[][]` and `marksFor` spreads it.

`app/marks.ts` took a `Happening` object rather than growing to four positional arguments, and the shared
GDACS envelope reading - zoneless dates, coordinate validation, the `iscurrent` string, the failing fetch -
moved into `sources/gdacs.ts` at the third copy. `volcanoes.ts` was migrated onto it and its eleven tests
passed unchanged, which is the only evidence that a refactor of a parser was safe.

**Capacity was re-derived rather than left.** 100 flames, 100 floods at three strokes of twelve, 23
triangles and a season of storm track lands near 5,100 segments against a buffer of 6,000. Raised to
12,000: the failure mode of guessing low is marks silently missing from the far end of the list.

## Looking at it found the bug that measuring could not

Five layers together, at the framing the app opens on, and four of them were invisible.

The glyphs were sized in **degrees**, on the argument written into `shapes.ts` that they are things on the
ground and should grow and shrink with the coastline. At the default zoom that makes a flame about five
pixels of thin achromatic line, so the globe showed nothing while the legend beside it described a hundred
fires, thirteen floods, sixteen volcanoes and four storms. Zoomed in to 3.2 they were obvious, which is why
every check up to that point had passed - I had only ever looked at them close up.

This is the same failure as the empty cyclone layer, arrived at from the other direction: not a handoff
that never fired, but a size that was only ever right where I happened to be standing. And the app had
already answered the question, in `events.ts`: markers hold a constant **pixel** size across zoom, because
zooming a dense margin should separate marks rather than magnify them. A symbol standing for a fire belongs
on that side of the line. The original reasoning is now recorded in `marks.ts` as falsified rather than
quietly deleted.

So a glyph scales as `REFERENCE_ZOOM / zoom`, clamped to [0.6, 6], rebuilt only when the factor moves more
than 8% so a wheel gesture costs a few rebuilds rather than one per frame. A **cyclone track keeps scaling
with the coastline**, because it is measured geography rather than a symbol - which is what `Mark.anchor`
distinguishes: present means "this is a glyph, scale it about this point", absent means "this is a place,
draw it as given". The anchor also keeps a flood's three strokes moving as one glyph instead of drifting
apart, and latitude is clamped so six times a flame near the pole cannot be drawn past it.

## The key folds, and the controls do not fold with it

Five layers made the legend seven paragraphs, which over the map is a wall in front of the thing it
describes. Collapsed, the box is the ramp, one line of summary and the two source buttons, and the whole
globe is visible behind it.

**The split is control against commentary.** The slider, the ticks and the source toggles are how you
change what is on the globe and they stay; everything below the scale is what the marks mean and it folds.
Getting that boundary wrong is the only real risk here - folding the slider away with the prose would make
the app less usable in exchange for a cleaner screenshot - so the e2e case asserts the controls are still
visible with the key shut, not merely that the key shuts.

**Open by default, remembered only once closed.** This app's argument is that no layer ships without the
sentence that explains it, so shipping it folded would hide that argument from everyone who never finds the
toggle. The viewer may dismiss it; the app does not get to pre-dismiss it for them. Persisted as the closed
state, so an absent key reads as the default rather than as a choice.

`<details>`/`<summary>` because the app already has that idiom in two places and `index.css` already gives
`summary` its 44px on a coarse pointer - a hand-rolled div with a click handler would have needed the
keyboard behaviour and the touch target written again. Controlled rather than native, because the state is
persisted and **React 18 does not listen for `toggle`**, so reading the browser's own open state back is not
available; `preventDefault` on the summary stops the native toggle and React owns `open`.

**Unverified:** nothing about this. Checked in the browser - it folds, the slider and both source buttons
survive it, the choice persists across a reload, and the summary is still keyboard-reachable.

## The share card had never been runnable, and then it lied

Regenerating the card for the rename turned up three faults in a row, each hidden behind the one before.

**`pnpm card` had never run.** `make-card.mjs` imported `playwright`, which is not a dependency here -
only `@playwright/test` is - so it failed with `ERR_MODULE_NOT_FOUND` every time. The file's own opening
paragraph complains that the previous card could not be rebuilt because its script was never committed;
the committed replacement could not be rebuilt either.

**`m=7.5` stopped meaning "an empty globe".** The script's rule is that no real events go on a card,
because clients cache it for days and yesterday's seismicity presented as now is the unlabelled-sample-data
lie DESIGN.md section 10 forbids. It enforced that by setting the magnitude filter above every earthquake -
which the new layers ignore entirely, correctly, since a fire has no magnitude. The first card built after
this week's work had a hundred wildfires and a minute-old aurora forecast on it.

**And the rings are not magnitude-filtered either.** With the hazard feeds blocked, the card still came out
with three orange wavefront rings on it at `m=7.5`: one moment's earthquakes, exactly what the rule exists
to prevent. So every feed is now blocked at the network - including the EMSC **WebSocket**, which
`page.route` does not see and which needs `routeWebSocket` or a single live arrival lands a ring on an image
cached for days. Blocked rather than switched off in the app, because a flag existing only to make this
picture is what the magnitude trick was chosen over in the first place.

Two couplings fell out of that and are written down where they will be read. The wait went from 7s to 11s:
the boundary reveal normally starts when the entrance replay finishes, and with no feed answering there is
no replay, so it starts on its 8s fallback in `Globe.tsx` and takes 1.5s to grow - 7s would now produce a
card with no tectonics on it. And `locator.screenshot()` **clips the page to an element's box rather than
isolating the element**, so the key-hint row overlaid on the canvas was being photographed onto the card:
"arrows orbit + - zoom" across the bottom of a social preview. Hidden with an injected style for the shot,
because it is right on screen and wrong only in a picture of it.

The card's line now names what the app actually shows - earthquakes, storms, volcanoes, fires and floods -
and the footer credits GDACS and NOAA beside USGS and EMSC.

## Deployed, and what the edge did with it

Live at `everythingisfine.aidenjang.com`, verified rather than assumed: the title, `og:image`, and four of
the five new sentences read back out of the served bundle, with `theOf`'s word list and `legendKey` standing
in for the two that are composed at runtime and so cannot appear as literals.

**The first check found a stale card.** The plain URL returned the old 132,780-byte image with
`cf-cache-status: HIT` while a cache-busted request returned the new 163,250. Assets are served
`max-age=0, must-revalidate`, and the edge revalidated on its own within a couple of minutes, so nothing
needed purging - but "wrangler said it uploaded" and "the internet is serving it" are different claims, and
a social card is the one asset where the difference is visible to everyone.

## The far side, as a figure rather than an animation

Item 3 asked to show that wavefronts reconverge opposite the epicentre. Costing the obvious build first is
what decided the shape of it: the live rings fade at **17 degrees of arc, 9.4% of the way** to the antipode,
and carrying one to 180 at the stated x20 playback would take **166.8 seconds** of screen time against the
15.75 it lives now - or 55.6 minutes of real travel on a surface path. There is no version of this that is
an extension of the existing animation.

**So it claims no time at all.** Every number in `geo/antipode.ts` is spherical geometry with no velocity
in it: the front is `2 pi R sin(theta)`, which is 20,015 km at both 30 and 150 degrees, 40,030 at the great
circle - exactly twice - and zero where it closes. That is not a workaround, it is the honest version.
Putting minutes on those arcs would need the teleseismic path through the mantle that `arrival.ts` already
declined by capping arrival times at 700km rather than pretending a crustal speed holds across the planet.
The panel sentence says "No time is drawn" out loud, and a test asserts the string contains no time unit,
because that is the one claim this figure must never drift into making.

Computed before any code, the way items 1 and 4 were, and asserted rather than hoped: the 30-and-150 pair
being identical is the whole argument, so it is a test rather than a comment.

**Drawn through the marks layer, with no new rendering.** Small circles are lon/lat polylines, so the layer
built for storm tracks took them as-is - seam handling, densifying and all. Deliberately **unanchored**: a
90-degree circle held at constant screen size would be this figure's argument thrown away, since how big
the front gets is the point. The circles are built by walking 360 degrees of bearing with the
destination-point formula, not by drawing an ellipse around a centre, which is why a 90-degree circle
centred on the equator genuinely reaches both poles - there is a test for that too.

**Offered, not triggered.** Five arcs across the planet is not something to hand somebody who clicked an
event to read its depth, so it is a panel button beside "Slice here". Two smaller decisions came out of
looking at it: the figure is gated on its event still being **selected**, because with the panel dismissed
the arcs would otherwise sit there with no explanation and no visible way to remove them - which both
closes a trap and keeps the standing rule that the sentence is present exactly whenever the figure is. And
turning it on pulls the camera to 0.9, since a viewer zoomed into a margin would see one arc crossing the
screen with no indication it belonged to a circle.

**Verified:** the geometry, by fifteen tests including arc-distance invariance, closure, the pole crossing
and the antipode being pi*R away; the arcs rendering and the sentence reading back its real numbers, by
screenshot; the selection gate, by watching the figure vanish when its event was deselected. **Not
verified visually:** the closing itself at the far side. Driving the camera across the planet needed
synthetic key events that the control's own animation kept coalescing, and after several attempts that was
not worth more of the session than the fifteen assertions already cover.

## Plate motion, from Bird's own numbers rather than from memory

The instinct for item 6 was Euler poles: a small table of rotation axes and one line of spherical algebra
per point. Two things killed that. It would have meant **writing pole coordinates from memory**, which is
the sin `arrival.ts` refused when it declined to keep a city list - and the app's boundary file is
`[lon, lat]` lines with no plate identity in them, so there would have been nothing to say which plate a
point belongs to and therefore nothing to apply a pole to.

PB2002's step file makes all of it unnecessary. Every one of its **5,819 steps** already carries the
relative velocity of the plate on one side with respect to the other, its azimuth, the divergent component
and a boundary class. So `tools/make-plate-motion.mjs` samples and rounds, and has no other opinions: the
velocities are published measurements. **260,483 km** of boundary, 231 arrows at 800km spacing, 101 of them
closing, fastest **227 mm/a**.

**The spacing was measured, not picked.** 500km gives 415 arrows, 800 gives 231, 1200 gives 133. 231 is the
one that still resolves a single ridge as a row of arrows rather than as three, at about 7kB.

**The angle is the whole feature and it came free.** Because these are relative velocities, an arrow's
angle against its own boundary *is* the regime: across the mid-Atlantic ridge the arrows run east-west
across a north-south line, and at the Peru-Chile trench they point into the continent. Both confirmed by
looking. Nothing computes that reading - it is what Bird's azimuths do once drawn - but the legend has to
say the word **relative**, because read as absolute motion over the mantle every arrow would be wrong, and
an arrow cannot carry that word itself.

**Rooted, like the markers.** Rates run 0.3 to 263 mm/a, and linear scaling would draw the median 30 mm/a
boundary at a fiftieth of the longest arrow, which is not a mark. Square-rooted it lands near a third, and
a test pins that ratio rather than trusting it.

**The arrows are walked, not offset.** Adding degrees to a longitude points the wrong way everywhere but
the equator - wrong by a factor of two at 60 north - so the shaft uses the destination-point formula, the
same one the far-side circles walk. There is a test asserting an arrow covers the same ground at 0, 60 and
-45 degrees of latitude.

**And the table stays out of the eager bundle.** The first working version imported the JSON in
`app/marks.ts`, which App imports at the top level, putting 7.1kB of static table in the bundle that has to
paint the first frame to serve a toggle that is off. That is precisely the mistake `waves.ts` exists to have
undone. `loadMotion()` is a dynamic import and `marksFor` takes the samples as an argument, which also
leaves it a pure function testable with two rows instead of 231. Verified by grep: the eager chunk contains
none of Bird's class names.

## The quiet map, cut down to what thirty days can say

Item 8 wanted the belts dimmed and the cratons lit, because the negative space is the story. Read literally
that is a claim about geological time, and this app holds at most thirty days in a ring buffer with no
backend. Inverting a single window would have lit up half the Ring of Fire, because most active belt cells
have no earthquake today either - the map would have looked like an insight and been an artefact of the
window length.

So the claim was cut, not faked. **Not which places are quiet, but how far each earthquake is from an
edge.** Measured before building, against a real day of USGS M2+ and the boundary file already shipped:
median **93 km**, half within 100 km, and that band is 9.4% of the surface. On the live feed with EMSC
included it reads 73% inside the band, a concentration of **7.8x**.

That ratio is published as a **floor**, and that is not hedging. A dense network finds magnitude 2 events
under Oklahoma while nobody at all is listening in the middle of the Pacific, so the catalogue over-counts
the interiors, which pushes the ratio down. The truth is above whatever the sentence prints.

**The tail is the feature.** The four furthest that day were Pahala in Hawaii at 3,557 km, Massac in
Kentucky at 2,136, Falls City in Texas at 1,203, and a magnitude 5.2 south of Dunhuang at 1,070: a hotspot,
a failed rift, an oilfield and the inside of a plateau. Every one of those names comes from the agency's own
text, so the panel states a distance and lets the name do the rest - the app never has to claim "hotspot".

**Not drawn on the markers, on purpose.** The obvious move is to ring the intraplate events, and item 10
already tried ringing markers twice and removed it twice: hairlines vanished under 10-20px discs, and an
offset ring read as a concentric scribble. Colour and size are magnitude and fill is depth, so the marker
has no channel left. This is a field in the panel and a sentence in the rail instead.

## The chord that cut through the planet

The first version of `nearestBoundaryKm` took the nearest point on the **chord** joining a segment's ends,
which is a line through the inside of the Earth. A 10-degree segment sags 24 km below the surface at its
midpoint, so a point sitting exactly on that stretch of ridge was reported 24 km off it.

On the real file it would never have shown: its vertices average 139 km apart, where the sag is 0.4 km and
hides behind the kilometre rounding forever. It surfaced because the test was built on a deliberately
coarse 10-degree line, and the comment sitting above the function claimed the two methods "differ by
centimetres" - **wrong by five orders of magnitude, written by me in the same commit.** It now measures
cross-track distance to the great circle, clamped to the endpoints, which is exact at any segment length.

A second wrong expectation in the same test file, worth keeping written down: I asserted that a point one
degree of latitude from a boundary running along 5N was 111.2 km from it. It is 119.7. **A line of constant
latitude is not a great circle** - the arc joining 5N,0E to 5N,20E bulges to 5.078N at the halfway meridian.
The code was right and the test was naive, so the test now pins the bulge on purpose.

An earlier measurement pass had the same class of error from the other direction: distance to the nearest
*vertex* rather than the nearest segment put the within-50km share at 11% where the truth was 32%. Three
mistakes, all of them "close enough on a sphere is not close enough", and none of them visible without a
number to check against.

## The still, and the stamp that makes it not a screenshot

Item 20's state half already travelled: the permalink carries the camera and the cursor. This is the image
half, and the interesting part is not the encoding.

**A still of live data outlives the data.** `make-card.mjs` learned that with a share card cached for days;
a still is the same problem shared by hand, with no cache to blame. So every one carries the moment it is
of, and it takes that moment from **the cursor, not the clock** - a still of a view parked two hours back
is a picture of two hours ago, and stamping it "now" would be the image lying about itself. Absolute time
with its date, never "18 minutes ago", which ages into a lie the instant the file is saved. UTC, so a still
crossing a timezone still means one moment.

**Captured in the same tick, deliberately.** The renderer is created without `preserveDrawingBuffer`, so
the buffer is gone once the browser composites and a late `toDataURL` returns nothing. The alternative was
turning that flag on, which taxes every frame of every session to serve a button almost nobody presses.
Instead `onCapture` hands out a function that renders and returns the canvas, and the caller must
`drawImage` it before yielding - the compose is synchronous and only the encoding is not.

**Composed, not grabbed.** Two reasons, both from the code as it stands: the globe's context is
`alpha: true` with a zero clear alpha, so a bare capture is a globe on transparency that viewers paint
black or checkerboard; and the chrome that explains the globe is DOM over the canvas, so it is not in the
capture at all. Letterboxed rather than cropped, because cropping a globe to a wider frame cuts the limb
off and the shape of the planet is what every reader orients on.

**A caption bug worth recording.** The first version described the window with `windowLabel`, which
qualifies itself by what the agencies have vouched for - and it printed **"nothing yet"** across a still
showing a full day of earthquakes, because `coveredSince` stays null until a source reports its seed. The
caption describes the filter that produced the picture, and that filter is 24 hours whatever any agency has
confirmed. Coverage is a live fact about the app and has no business stamped on an image, so it says
"last 24h" from `filters.windowMs` and nothing about coverage at all.

In the header strip beside the ramp toggle, not in the panel next to "Copy link": that button shares an
earthquake, this one shares a framing, and the panel only exists while something is pinned.

**Verified in the browser**: the composed frame is 1600x900, fully opaque, background exactly the `void`
token, 34% of the globe area differing from it - so the drawing-buffer hazard is genuinely handled and not
merely avoided in theory. Caption read back as "Live - 2026-08-21 04:09 UTC" and "M2.0+ - last 24h".

## The tour, and reading the rule instead of the paraphrase

Item 19 was gated behind a DESIGN.md ruling, and the working notes described the obstacle as a ban on
rotation "even when a person starts it". Going and reading the rule showed that is not what it says.
Section 13 bans "**Ambient** globe rotation", and section 8 gives the reason: a pulsing element is "motion
that means nothing, and the moment a viewer sees motion that means nothing, all the other motion becomes
suspect."

**The bar is meaning, not movement.** So the ruling was not an exemption from the rule, it was applying the
test the rule already states - and it turned into five requirements the tour has to meet: it is asked for;
every stop is a real place whose name and live count the rail shows **while the camera is there**; the
stops come from live counts so a quiet margin is not on the route; it ends after six; and any interaction
kills it. Strip the narration and this becomes the screensaver the rule exists to prevent, which is why
the label is not decoration. The ruling is now written into DESIGN.md next to the rule, so the next person
does not have to re-derive it.

**No authored stops were needed.** `REGIONS` already exists for the rail to fly to, and the order comes
from live counts, so the route is wherever today's earthquakes actually are, busiest first. Ties break on
name so the route does not reshuffle between renders. `prefers-reduced-motion` needed no special case at
all: `flyTo` is already instant under it, so the tour degrades into cuts with dwells and no travel.

**A race in the Stop button, found by reasoning and then reproduced.** The end-on-interaction listener
catches `pointerdown` anywhere, so pressing Stop with a mouse fired pointerdown - ending the tour - and
then the click handler read whichever `tourAt` React had committed by that instant. Stale stops it; fresh
restarts it. It landed on "stopped" every time it was tried, which is the worst way for a race to behave.
The listener now ignores events inside the tour's own button, which is also the more honest rule: operating
the tour is not reaching for the globe.

**Verified in the browser**, all four paths: a full mouse press starts it, a full mouse press on Stop stops
it without restarting, a keydown ends it, a wheel ends it, and a press on the globe ends it. The button is
absent entirely on an empty window - confirmed by accident when a hot reload emptied the store - because a
tour of a planet with nothing on it is exactly the motion the rule bans.

## Two rulings, and the gap they turned up

Items 5 and 18 both wanted the descending slab more visible. Both are refused, and neither refusal is a
design opinion.

**A depth ramp (18) was never a toggle.** The ramp track *is* the magnitude filter here - the slider runs
along it, which is the one idea that made the legend and the control the same object - so repointing that
ramp at depth puts a magnitude control on a depth scale. It is a rebuild of the signature control, not a
mode. And it would spend hue on a reading the app already has: the marker hole is continuous in depth
already, `hole = 0.30 * vDepth`, so a margin resolves from discs to rings without any colour.

**Real depth (5) is erasure, not a trade.** 700km is 11% of the Earth's radius, so an event drawn at its
true depth sits *inside* an opaque globe and does not appear. The spatial reading it wanted already exists
in the cross-section, which is an actual depth section. I also measured the dip as a possible number
instead, and refused that too: regressing depth on distance across a week of M2+ gives r-squared of 0.02 to
0.12 and puts **Tonga at a negative dip** on 14 events - Tonga being one of the steepest slabs on Earth.
A fitted figure from that is the same overreach `Sequence.tsx` refuses when it declines to fit an Omori
exponent to a dozen arrivals.

**What the measuring actually found was a claim in our own code.** `events.ts` said a diving plate "reads on
the globe as solid dots at the trench giving way to rings inland ... that is the Wadati-Benioff zone." The
encoding does that. A typical day does not supply it: in 24 hours of M2+, **1 event of 79 is below 300km**,
one ring on the whole planet, with 8 more intermediate. Over seven days it is 14 of 704 and a margin starts
to show. So the pattern is real at the right window and absent at the default one, and the comment promised
it unconditionally.

Fixed the way this app fixes that kind of thing: the comment now carries the counts, and the legend states
them live - "70 above 70 km, 8 between 70 and 300, 0 below 300" - so a viewer knows whether there is a slab
to look for instead of being told to expect one. Same move as the corroboration note, which replaced a
claim about what a viewer would see with the number saying whether they could.

The bands moved to `data/depth.ts` on the `geo/waves.ts` precedent: they are facts about earthquakes, the
legend needs them, and the legend must not import a module that drags three.js into the first paint.

## Sound, with the rule written first

The last gated item, and the only one gated on an absence: DESIGN.md said nothing about audio, so anything
built into that silence would have set the rule by accident. **12b was written before any code**, and the
feature is what fell out of it.

The test section 8 applies to motion applies harder to sound, because audio cannot be looked away from. So:
no drone, no ambient bed, no click or hover feedback, nothing at all on a quiet globe. One earthquake, one
tone.

**It follows `newsIn`.** A cold load admits sixty events at once and none of them just happened; the live
region already learned that and decides news by the clock rather than by what it has seen. Sound reuses
that exact predicate rather than a second implementation, which is what makes a seeded backlog physically
unable to sound. It reuses the announce threshold too, instead of adding a slider - "tell me about events
above this" is one idea, and the rail already has the control.

**The mapping is derived, not composed.** Pitch falls as magnitude rises, because a larger rupture radiates
a lower corner frequency; duration grows, because a larger rupture lasts longer. Geometric in frequency,
since pitch is perceived logarithmically and a linear interpolation would spend most of the audible range
on the top of the magnitude scale where almost no events are. Loudness is the one channel that cannot be
honest - three points of magnitude is thirty thousand times the energy - so gain is compressed and the
legend admits it rather than implying a scale.

**Two disclosures, both load-bearing.** It is not a recording: real ground motion is below hearing, under
about 10 Hz, so any audible rendering is a transposition - the same admission the wavefronts make by
printing their x20 multiplier. And loudness is not energy. A tone offered as the sound of an earthquake
would be the one outright falsehood in this app, so the sentence leads with what it is not.

**The context is built on the press.** An `AudioContext` created without a gesture starts suspended and
every later tone is dropped silently, which is the failure where the toggle reads on and nothing is ever
heard. Closed again when switched off, because a suspended context is still a device handle. Three voices
maximum, loudest kept: a swarm can deliver a dozen arrivals in one poll, and a dozen tones is a noise.

**Verified in the browser.** A full cold load with the backlog seeded produced **zero tones and zero audio
contexts**; enabling created exactly one; the disclosure is on screen whenever sound is. Then the real
module was driven through a real `AudioContext` with five simultaneous magnitudes and played **110, 151 and
209 Hz** for M7.5, M6.0 and M4.5 - three voices, loudest first, lower for bigger, matching `toneHz` exactly.
The first attempt played nothing, and the reason was the hidden-tab guard doing its job: the preview pane
reports `document.hidden`, so the check had to be overridden to hear anything at all.

## The legend grew past the screen, one row at a time

Deploying the session's work and then looking at the live site at **1280x720** - an ordinary laptop - found
a regression nothing had flagged. The legend panel had reached **845px in a 720px viewport**. Nothing in
the ancestor chain had a max-height or an overflow, so the bottom band's top sat at **-157** and the
**magnitude slider was 104px above the top of the window**: the app's primary control, off screen and
unreachable, with no scrollbar anywhere to hint at it.

No single change did this. The storm, volcano, fire, flood, motion, depth and sound rows each added a few
lines to the same box, and the collapsible key - added exactly because the legend was getting long - hid
the problem by being the mitigation everyone remembered instead of a cap.

**Two mistakes fixing it, both worth writing down.**

First, the cap silently did nothing: `max-h-[calc(100dvh-4.5rem)]` is invalid CSS, because calc needs
whitespace around the `-` or `-4.5rem` parses as a negative number and the declaration is dropped. This
repo has a note about `xl:left-[calc(var(--rail-w)+1rem)]` failing the same way, and I walked straight back
into it. Tailwind arbitrary values need underscores: `calc(100dvh_-_4.5rem)`. It was caught by measuring
`getComputedStyle(...).maxHeight` and finding `none`, not by looking - the panel is tall enough that a
screenshot of the broken and fixed versions look similar at a glance.

Second, capping the height moved the *source toggles* off the fold. They sat at the bottom of the panel,
below seven paragraphs of prose, so the fix turned one unreachable control into another. They are now
passed into `MagnitudeFilter` as a child rendered above the folding key, which makes true the split the
fold already claimed: **all the controls above all the commentary**, and only the explanation scrolls.

Verified at 1280x720 with the key open: capped at 648px, scrolling, and the slider, both source buttons and
the key toggle all inside the viewport, with no horizontal scroll.

**The lesson is about where the check goes.** Every layer this session was verified by looking at the
globe, which is where the layers are. The legend was verified by reading its sentences, which is not the
same as measuring the box they are in.

## A phone, which nothing this session had been checked on

Everything built today was verified at desktop width. DESIGN.md 11 has a mobile contract - single column,
globe on the top 60dvh, 44px touch targets, and horizontal scroll at any width declared a build failure -
and none of the session's new controls had been measured against it. Emulated at 375x812 with a coarse
pointer, three things came out, and two of them were mine.

**The grid invented columns.** `.zone-panel` names a `panel` area that only exists at 1280px and up, and
below that a grid item naming a missing area is auto-placed. The base `.zones` rule declared rows and areas
but **no columns**, so the browser made them: at 375px the grid measured **218 + 0 + 219 = 437px**. Opening
an event on a phone pushed the panel, the rail's headline and the header's last button off the right of the
screen. One declared column fixes it, and the panel stacks into an implicit row underneath instead - which
is what "single column" already promised. Pre-existing, and today's work made it visible by giving people
more reasons to open the panel.

**The header outgrew the phone, and that is mine.** It held Map and the ramp toggle; Sound, Tour and Still
joined it this session, and at 375px the last was clipped rather than scrolling into reach. It now wraps,
which costs a second header row on a phone and is the cheaper loss than a control nobody can press.

**The panel's action row, also mine.** Fly here, Slice here and Copy link fit at `nowrap`; adding Far side
pushed the last two past the right edge, where a clipped button is an action that does not exist. It wraps
now, to two lines on a phone and one everywhere else.

**Two non-bugs, both nearly "fixed".** The wordmark reads "FINE" on a phone, which looked like truncation
and is a deliberate `md:hidden` pair written during the rename. And the glyphs looked oversized against a
small globe, which would have been the viewport mistake `events.ts` documents for markers - measured
instead: a flame is 19.5px on a 382px globe, **5.1%**, against 4.4% on desktop. The mobile screenshot is
rendered at 2x, and that was the whole of the effect.

**Verified at 375x812:** one 375px column, no horizontal scroll, every button clearing 44px, key hints
correctly absent, and all four panel actions plus every header control inside the viewport.

## The tablet, where the header wrap turned out to have a price

The mobile fix touched the 768px media block, so that breakpoint had to be checked too, and it showed what
`flex-wrap` costs when the row is merely *tight* rather than overflowing. At 768x1024 the five controls
wrapped into **four rows** - a 150px bar over a tablet's canvas - because the header's count strip was
taking about 380px of it. Wrapping had stopped a button being unreachable and replaced it with a header
three times too tall.

Wrapping stays as the backstop, and the crowding is fixed at the source, following the header's own
existing precedents rather than inventing one: the count strip now waits for `xl` instead of appearing from
`sm`, and the ramp's long label waits for `lg` instead of `md`. The rail carries the same counts, so the
strip is the half to drop - which is the call the wordmark ("FINE" on a phone) and the ramp label already
made.

**Verified across all three:** 768 is a single 50px header row with the rail's four columns intact; 1280
keeps its 46px header *with* the counts and every control, ending 20px short of the edge; 375 is unchanged,
since the strip was already hidden and the short ramp label already applied there.

**The wider point, twice over now.** Both of the last two turns found layout faults, and neither was in a
feature. `flex-wrap` is a fix for overflow and a disguise for crowding, and the difference only shows at a
width nobody had opened.

## The contract was already written, and asleep

Three layout faults in three turns, all found by hand, so the next question was whether they should have
been caught. `e2e/design.spec.ts` already sweeps four breakpoints - 375, 768, 1024x768 landscape and 1280 -
asserting at each that the page does not scroll and that nothing overflows sideways. Reading it changed what
this turn was about.

**The 375px grid blowout was inside that contract.** The sideways test takes the maximum `right` of every
element and requires it to be within one pixel of the window; at 375 that maximum was **381**. It would have
failed. It did not fail because the suite is skipped, so the check has been dormant while the exact class of
bug it covers shipped three times. An encoded contract that never runs is not a contract, and that is a
call for the repo's owner rather than something to route around.

**The legend regression was outside it, and that is a real hole.** The slider sat at **-104px**, above the
top of the window. Nothing scrolled and nothing overflowed sideways, so both existing tests passed
truthfully. Neither of them asks whether a control is *reachable*.

So the invariant is now written down: at each breakpoint, every button, link, summary and input must have
its box inside the viewport - **or** have a scrolling ancestor, because the rail below 768px is deliberately
a sheet whose lower half is off screen and that is not the same fault at all. That distinction is the whole
reason the check could not be a naive bounds test.

**Then it was run.** 55 passed, 4 failed, 1 flaky, 13.3 minutes - and it earned its keep four ways.

**One failure was a stale expectation of my own making.** `the legend says what a ring is` asserted the
legend contains "First motion is a seismogram term". That sentence existed to explain the app's own name
while the app was called First Motion; the rename to Everything Is Fine removed the name, so the sentence
explained nothing and was deleted with it. **The rename commit edited other strings in this same file and
missed that one**, and because the suite was not running, a stale assertion sat there green-until-executed
for the rest of the session. Fixed, and it passes.

## The rail's list collapsed to nothing, and took three tests with it

The three click failures came down to arithmetic, once the geometry was measured in the failing state
rather than reasoned about. With one event held on a 720px window:

- `ul`, the list's scrollport: **height 0**, scrollHeight 44
- `section[aria-label="Recent earthquakes"]`: **height 0**
- `.zone-rail`: a **674px box around 752px** of content, so scrollable by 78px
- the only row: top **806**, which is 86px below the window

The rail is a column that scrolls when its content does not fit, and the list is `flex-1` so it takes what
is left over. When there is nothing left over, `flex-1` correctly resolves to **zero**, and `min-h-0` let
it go all the way there. The row then sat outside a zero-height box, past the rail's own scrollable extent,
and 78px of scroll could never close an 86px gap. That is precisely Playwright's `done scrolling` followed
by `element is outside of the viewport`, forever.

The fix is a floor: the section keeps `min-h-[8.25rem]`, three rows, instead of `min-h-0`. `min-h-0` is
still what lets a scrollport shrink below its content - it just must not shrink to nothing. Honouring the
floor makes the rail scroll further, which is the correct trade: a list of three rows you can scroll beats
a list of zero rows you cannot reach. Re-probed: the section is 132px, the scrollport 85px, and all three
tests pass.

**It was worth dating first.** The same test fails identically at `6e1ba7f`, before any of this session's
feature work, run with the port freed so the old commit served its own app - the first attempt at that
comparison was worthless because `reuseExistingServer: true` had pointed an old worktree's tests at the
current server. So this predates the session; the layout work merely made it visible.

## Asking one question at a time, and the suite went green

The camera assertions were all written as "is it at the target yet, within N seconds", which asks two
questions and answers neither on failure. The entrance was the clearest case: a ten-second poll that
reported `Timeout 10000ms exceeded while waiting on the predicate` and `Received: false` - no way to tell
whether the camera was still travelling, had stopped somewhere wrong, or had never started.

So the questions are separated. `cameraStill` waits for **motion to stop** by sampling until two
consecutive readings agree, with a ceiling that exists to catch a spring that never settles rather than to
time a machine, and it reports movement-per-sample so a real failure says how fast it was still going. The
test then asserts where it came to rest, which is the actual claim. A slow machine makes the suite slower
instead of red.

**It samples `morph` alongside lon/lat/zoom**, because the projection unwrap is the same kind of value
easing toward a target, and a screenshot taken partway through is neither a globe nor a map.

**Four blind waits went with it** - 9s before a drag, 6s before reading the projection toggle, and two
2.5s waits around the unwrap screenshots. Twenty and a half seconds of guessing, replaced by waiting for
the thing itself. On a quiet machine that is faster, not slower: the full suite went from 14.7 minutes to
**11.6**.

The two-page shared-link test got double the budget instead, because it genuinely does double the work -
a second page with its own fixtures and its own WebGL globe - and exhausting 45s of that is the test's own
cost, not a claim about the app.

**Result: 60 passed, nothing failed, nothing flaky.** The four flaky-then-passing tests and the two
timing failures from the previous run are all gone, which is the evidence that they were the polls and not
the app.

**Two failures in the earlier run were load, not faults.** `the entrance settles exactly on the
framing shot` and `a shared link restores the view on a fresh page` both pass in isolation, and the config
already records the same thing happening at four workers: the entrance spring takes longer than its poll
allows on a saturated machine. Four more tests were flaky-then-passing in the same run, which is the same
story.

**Three failures were pre-existing, and that was proved rather than assumed.** All three click a row in the
rail's recent list, and all three report the same thing: `done scrolling`, then `element is outside of the
viewport`, retrying until timeout. The first attempt to date them was worthless - `reuseExistingServer: true`
meant a worktree at an older commit ran its tests against the *current* server on 31600. With the port freed
so the old commit served itself, the same test failed identically at `24a8fc4`, before the legend cap, the
one-column grid and the header wrap. Localised, not fixed: something about the rail's scroller leaves a row
that Playwright can scroll to and still not see.

**The flaky one is infrastructure.** `the colourblind ramp survives a reload` died on `Protocol error
(Runtime.callFunctionOn): Internal server error, session closed` - a browser process lost under two
concurrent WebGL workers, which the config's own comment already warns about at four.

**And it corrected the check written the turn before.** The new reachability case exempted any control with
a scrollable ancestor. Playwright's `done scrolling / element is outside of the viewport` is exactly that
exemption being wrong: a container can scroll and still be somewhere nobody can see. The rule now requires
the scrolling ancestor's own box to intersect the viewport. Four cases, first execution, all passing.

One process note worth keeping: the full run was piped through `tail -45`, so only the closing summary was
ever written and the per-test lines and four failure bodies were destroyed. `test-results/*/error-context.md`
had all of it. Do not filter a long run's output on the way to a file.

**Hand-verified at five shapes** before any of that, while the spec was still unrun: 375x812, 768x1024, 1024x768, 1279x700 with the
legend key open, and 1280x720 - zero unreachable controls at every one, and the widest-element check inside
the window at every one. Panel-open was verified at 375 in the previous turn (four actions, two lines, all
inside); **at 768 and above, panel-open is unverified**, because the dev feed stopped delivering events on
that tab and a check with no panel on screen proves nothing about the panel.

## A test sitting exactly on its own ceiling

`the globe unwraps into a map and back` was failing with the projection toggle reading `""`, which looks
like a broken header and was nothing of the kind. Three things settled it, in order of how much they
narrowed it down:

- Driven by hand in a browser, the sequence is fine: Map, Globe, Map, with `eif.flat` correct each time
  and the canvas still there. So the app was not breaking.
- `pageerror` and `console` were both silent through a passing run, so nothing was throwing.
- A **passing** run measured **45.5 seconds** against the default 45s budget.

It was being killed mid-assertion, and `toHaveText` reporting `""` was the header seen through a page that
had stopped. Three runs after raising the budget: **43.4s, 49.7s, 55.4s** - two of which would have failed
at the default. The variance straddles the ceiling, which is why it looked intermittent and personal.

The cost is real rather than wasteful: an entrance to wait out, two morphs, and **two WebGL canvas
screenshots**, which are the expensive part. Same call as the two-page shared-link test - when a test
legitimately does twice the work, the budget is what moves, not the assertions.

**A correction to the previous entry.** I reported this failure as "proved not mine" after stashing my
changes, and that proof was weaker than stated: the stash covered only the working tree, so everything
committed earlier in the session was still in play. The conclusion happened to be right - it is a budget,
not a regression - but the evidence given for it was not.

## The stillness helper, and knowing when to stop using it

`cameraStill` was written to replace fixed waits, and it ran a clean 60/60. Trying to tidy it made three
things clear, one of which cost most of a session.

**Its ceiling was incoherent and its threshold was wrong.** A 60s poll inside a 45s test budget means a
slow settle dies as an opaque `Test timeout` rather than failing here with the number it was seeing. But
lowering the ceiling to 20s turned that latent problem into failures, because the threshold was **1e-4 per
sample** against exponentially eased springs: the delta shrinks geometrically and never reaches zero, so
1e-4 is many time constants past the point where the camera has visibly stopped. It passed at 60s for that
reason alone, not because 60s was right.

**And it is the wrong tool for some of what it replaced.** "Wait until the camera stops so I can assert
where it stopped" is a real question. "Wait until the picture has changed enough to screenshot" is not the
same question, and the projection-unwrap test only needs the second - a stillness threshold tight enough to
mean *finished* is reached long after the projection has visibly changed. That test's flat waits are back,
with the reason written next to them.

The helper stayed at the version that was green; the tidy-up was reverted rather than defended. The lesson
is the one about thresholds: a settle test needs a threshold set by what a viewer or a screenshot can
resolve, not by how small a float can get.

## Walking a swarm, which was one field away

The sequence strip has shown every neighbour of a pinned event in time order for a while, and the panel
listed the four largest by magnitude. Neither could be visited. The gap was smaller than it looked:
`findNearby` already walked every neighbour, built the sequence and sorted it by time - it just mapped away
the identity, keeping `at` and `magnitude`. Carrying `key` costs one field on a list that was already being
built.

**Nearest in time, not nearest in space.** A sequence is a thing that unfolds, so "the next one" means the
next one to happen. An offset of exactly zero is a neighbour sharing this event's instant and is
deliberately neither step: calling it earlier or later would be inventing an order the data does not have,
and there is a test for that.

**Labelled with the magnitude, not "previous" and "next".** The useful question inside a swarm is how big
the next one was, so the buttons read `<- M2.4` and `M3.3 ->`. Hidden rather than disabled at either end of
a sequence, because a dead control is a question a viewer has to answer.

Stepping re-pins, which re-centres the neighbourhood on the new event. In a tight swarm every member is
mutually within the 150km radius, so this walks the swarm; in a loose cluster it drifts toward whatever is
near the event now pinned. That is the honest behaviour of "what is near what I am looking at" rather than
a fixed playlist, and it is the same set the panel is already describing.

## Running the suite against what actually ships

The browser tests had exercised `pnpm dev` for their whole life, and the gap that leaves is specific: a
dynamic import that resolves in dev and splits wrong in a build, or a Tailwind arbitrary class that works in
dev and is purged from production CSS. Both of those categories arrived in this project recently - two
`await import()` calls and a batch of `[calc(...)]` classes - so the gap stopped being theoretical and
started being a live risk on a deployed site.

`EIF_BUILD=1` swaps the web server for `pnpm build && pnpm preview`, with `preview` pinned to the port the
suite already targets. **Nothing was broken**, which is the answer that costs the least and is worth having
rather than assuming: the whole design suite passes against `dist` at all four breakpoints, so the arbitrary
classes survive purging, and the plate-motion toggle flips and prints its sentence in a production build,
so the dynamic import resolves.

Worth recording about the chunking: `plateMotion.json` has no chunk of its own. Vite folds it into the
`land` chunk that the globe already loads, so `loadMotion()` resolves from cache rather than fetching. The
point of making it dynamic still stands - it is out of the bundle that paints the first frame - but it is
not a separate request, and a comment claiming one would be wrong.

**Not verified by hand:** the panel's boundary distance in a build. Its `plates.json` import is the same
module `geo/plates.ts` imports statically, and the boundaries render in the build, so the data is present -
but the field itself went unchecked because the live feed stopped answering in that tab and no event could
be pinned.

## Measuring the GPU, and why the loop had to be worked around

The rendering side had never been measured, and the reason turned out to be structural rather than
neglect: **the frame loop sleeps whenever nothing is moving**, which is the design, so there are no frames
to instrument unless something is animating. `EXT_disjoint_timer_query_webgl2` is available in this browser
on this machine, and `canvas.getContext("webgl2")` hands back the app's own context - so the instrument was
never the problem.

Waking the loop from outside was. Synthetic wheel, key, pointerdown and drag events all produced **zero**
`requestAnimationFrame` calls, so the patched-rAF approach had nothing to wrap. Rather than fight the event
plumbing, `__drawOnce` was added beside the DEV-only hooks the browser tests already use: it calls the same
`render` the loop calls, so what it costs is what a frame costs, and it can be driven as fast as the
measurement wants.

Numbers and their conditions are in the closed item above. Two things worth keeping separate from them:

- **The harness stays**, for the reason the share-card generator does. A measurement nobody can repeat is a
  number that quietly stops being true, and this one took several attempts to obtain.
- **The 120Hz figure is the interesting one.** At 60fps this is a quarter of the budget and nobody will ever
  notice; at 120fps the worst frame measured is 77% of it. Nothing here is a problem today, and that is a
  different statement from "nothing has suggested a problem".

## The third axis nobody had measured

The known false positive - an aftershock folded into its mainshock - was written down as unfixable, and
the reasoning was sound as far as it went: in **time** and **distance** the two populations really do
overlap, so no threshold on either separates them without dropping genuine pairs. The gap was that
association only ever used those two axes. Two agencies describing one rupture also agree about its
**size**, and an aftershock does not.

Measured the same way the original windows were, on two independent samples:

|                    | pairs | median | p90  | max  |
|--------------------|-------|--------|------|------|
| M2.5+, 24 hours    | 50    | 0.00   | 0.20 | 0.40 |
| M6+, 120 days      | 47    | 0.00   | 0.00 | 0.10 |

**The obvious objection was the one worth checking.** `mb` saturates around 6.5 while `Mww` does not, so
a magnitude window could in principle split a great earthquake into two markers - far worse than the bug
being fixed, and on the most important event. The second sample says it does not happen: above M6 both
agencies publish Mw or Mww and the pairs agree to 0.1, M7.8 and M7.7 included. The worst disagreement
anywhere in 97 pairs is 0.40, and it is on *small* events, where the scales differ most.

So the limit is one magnitude unit: two and a half times the headroom over the worst pair observed, and
below the ~1.2 units Bath's law puts between a mainshock and its *largest* aftershock. Re-run against the
same day of real data, it changes nothing that was working - **50 of 53 USGS events match an EMSC
counterpart either way** - which is the point. It removes candidates rather than matches.

**Two things it is not.** It is not a fix: a doublet within one unit still merges, and that needs waveform
data. And it is not demonstrated catching a live false positive, because there was not one to catch -
zero same-agency pairs fell inside the windows in that 24 hours, which is consistent with the tightened
windows having already made it rare.

`sameEvent` also had **no direct test** before this, only the store's behaviour around it, which is the
wrong place to find out that the project's central decision has changed. It has twelve now, and the
measurements are written into them rather than into a comment beside them.

## The gate that skipped itself, and the summary line that said so

Every unit run this session reported `670 passed | 1 skipped`, and I read that skip as noise for a dozen
turns. It is the heap test - `it.skipIf(!globalThis.gc)` - and it only runs when node is started with
`--expose-gc`, which `pnpm test` does not do and `pnpm test:heap` does.

CI was already right: it runs `pnpm test:heap`. **`pnpm check` was not.** It ran `typecheck && test && build`,
so the one command a person runs before pushing reported success while the gate that guards against the app
leaking over a long session sat out. Local and CI disagreed about what "all tests" meant, and the local one
was the weaker of the two - which is the wrong way round for a pre-push check. `check` now runs `test:heap`,
which costs about six seconds and makes the two agree.

Run, because a gate nobody has run is a gate with an unknown answer: **four hours of synthetic ingest grew
1.40MB** against a 5MB ceiling. Comfortable, and worth having the number rather than the pass.

The test itself was already built to be honest about this - its own comment explains that `skipIf` was
chosen over an early return precisely so a run that did not measure says so in the summary instead of
reporting green. It worked exactly as designed. The failure was mine, in reading the line it prints.

## Both suites, end to end, and what the build mode was actually for

The session had changed the reconciliation core, the activity strip, the detail panel, `nearby` and a good
deal of test infrastructure, each verified on its own and never together. Together, on a quiet machine:
**62 passed, nothing failed, nothing flaky, 7.7 minutes** - about half the 14.7 minutes the same suite took
before the blind waits came out of it.

Then the same suite against `dist`, which had never been done, and it earned its keep immediately: **seven
failures that do not happen in dev**. Not a bundler fault, which is what I was watching for - the opposite.
Those tests read `window.__globe` and `window.__feed`, and `Globe.tsx` exposes them only under
`import.meta.env.DEV`. A production bundle should not carry a debug surface, so those tests cannot run
against a build *by construction*.

`Cannot read properties of undefined (reading 'store')` is what a contract looks like when nothing states
it. It states it now: `needsDevHooks()` skips those seven in build mode and the summary says **55 passed,
7 skipped**. That is the same principle the heap test argues for in its own comment, arrived at from the
other direction - a run that did not check something has to say so, or it is indistinguishable from a run
that checked and was happy.

So the two commands mean different things on purpose, and both are honest about which: `pnpm test:e2e`
covers 62 including the instrumented ones, `pnpm test:e2e:build` covers the 55 that a shipped bundle can
answer for.

## The five layers can be asked questions now

Adding storms, volcanoes, fires, floods and the aurora left an asymmetry I did not notice while building
them: **every one of those marks was inert.** Clicking an earthquake opens a panel with depth, neighbours,
arrival times and distance to a plate boundary. Clicking a cyclone did nothing at all - while the app held,
unused, that it was SAUDEL-26 with a 222 km/h peak and a 17-point track. The legend could only ever speak
about the whole set: "4 tropical cyclones running", "100 fires, 9,124 square kilometres".

**Picking reuses what the markers already do.** `controls.project` turns a position into a screen point, so
a mark is picked the way a marker is: project the candidates, measure in pixels, take the nearest. The only
missing piece was identity - a `Mark` had an `anchor` saying where it is and nothing saying which thing it
was - so `Mark.id` carries `kind:id` and the layer keeps the list it used to flatten into buffers and
forget. Earthquakes are tested first and win ties, which is the hue budget expressed as pointer priority.

The slop is 18px against the markers' much tighter radius, because these are **outlines**: the middle of a
spiral or a triangle is empty, and demanding the pointer land on a stroke would make them feel broken.

**A separate card, not the earthquake panel.** That panel is built around a reading two agencies dispute -
depth, sequence, corroboration, arrival times - and none of those exist for a wildfire. Reshaping it to
hold both would make it worse at the thing it is good at. The card takes the same grid slot, so only one
answer is ever on screen.

**Every row is a fact the feed carries, and absent otherwise.** A storm with no wind reading shows no wind
row rather than a dash; a flood says outright that this feed does not rate them, because it files every one
as magnitude zero; a volcano leads with "Not erupting now", which is the one thing that layer must never
imply. Subjects are resolved at render from the arrays already held, so a mark dropped by a ten-minute
refresh loses its card rather than freezing the last one - there is a test for that, and for an id
containing colons, which a naive split would have broken.

**Verified in the browser, and the first attempt was worthless.** A click on a flood's exact projected
position produced its card; a click on empty ocean cleared it. The run before that appeared to succeed
instantly and was measuring nothing: the browser pane had collapsed the canvas to **40x0 pixels**, so every
position projected to within a few pixels of every other and any click "hit" the nearest mark on the
planet. A hit test is only as meaningful as the viewport it is measured in.

## An archived day, built as a mode rather than a slider

The limitation said this needed a backend. It did not: `earthquake.usgs.gov/fdsnws/event/1/query` and
`seismicportal.eu/fdsnws/event/1/query` both take an arbitrary span, keylessly, with
`access-control-allow-origin: *` - the same endpoints this project has been using for its seeds all along,
asked a different question. What the note was right about is what makes this dangerous: **a globe showing
last March while the interface says "both feeds live" is worse than not having the feature.**

So the guard is structural rather than a caption. `FeedSnapshot.archive` carries the span, which means
nothing can read the store without also being able to see that it is not live, and `showArchive` **stops
the sources** rather than filtering them - a socket push landing during an archived day would be a day that
never happened. Coverage is set to the span requested, because unlike a truncated catalogue page the
request itself names both ends. It announces as a *seed*, so a day of events is one wavefront rather than
six hundred, reusing the machinery the daily seed already needed.

**One substitution did most of the work.** Every window, strip, dial and count here is "the last N hours
before now", so the clock became `archive.to` when archived: "the last 24 hours" then means the last 24
hours *of that day*, which is exactly what was fetched. Without it the store held 600 events from July and
the headline read 0. The cost is that relative labels become relative to that day, which is honest inside a
mode whose banner says the date and "nothing here is arriving now" - that banner is load-bearing.

**Three bugs found while building it, all mine.**

`announce` coalesces through `requestAnimationFrame` because arrivals are bursty. A mode change is not
bursty, it happens because somebody pressed something - and deferring it to the frame clock made it depend
on the page being painted, so in a throttled tab the day loaded and no subscriber ever heard. It delivers
synchronously now.

The filtering memos read the clock **inline** rather than depending on `now`, deliberately: `now` changes
every render and listing it would recompute a fifty-thousand-event sweep every second. So substituting the
variable changed nothing until those call sites were routed through a stable `clockAt()` - which works
because `showArchive` bumps the revision the memos already key on.

And `clockAt` was declared two hundred lines below its first use. A `const` in a temporal dead zone is a
runtime error, not a type error, so `tsc` passed, the build passed, and the page rendered **nothing at
all**. `Globe.tsx` already carries a note about the same trap taking the whole canvas with it.

**Verified in the browser**: 2026-07-04 loads 600 distinct events from 303 USGS and 399 EMSC rows, spanning
exactly midnight to midnight; the header shows the date instead of the feed status; the strip, regions and
largest-event row all describe that day; and "back to live" clears it and re-seeds. The day even replays on
entry, which was not designed and is the right behaviour.

**And then the link had to say so.** Shipping the mode without touching the permalink left the URL
describing a view the app was no longer in - you could load a day in July and the address bar still said
live. This document argues throughout that a link says where *and* when, and an archived day is the
strongest "when" the app has, so `d=YYYY-MM-DD` now travels with it. A link carrying one arrives in that
day rather than live; leaving drops the key.

The day rather than the span, because the span is derived and a URL carrying both could disagree with
itself. Validated as a real calendar date rather than pattern-matched: **`2026-02-31` matches the shape and
is not a date**, and `Date.parse` would have rolled it silently into March. A future day is refused too,
because there is nothing to fetch - the same rule the decoder already applies to a 100-hour window.

One bug in the wiring, and it was the same mistake one layer down: `write` closes over the snapshot and the
interval keeps calling the closure it was created with, so entering an archive left the link saying live
until some unrelated dependency happened to change. `snapshot.archive` is a dependency now.

## Closing the door on one feed and leaving it open for five

The archive stops the earthquake sources so a socket push cannot land in a day that already happened. Two
things went on claiming the present anyway, and both were mine, from the two turns that built this.

**The other five layers were still live.** Storms, volcanoes, fires, floods and the aurora are fetched
unconditionally, so an archived day in July drew **today's** hazards over July's earthquakes - precisely the
day-that-never-happened the socket is stopped to prevent, arriving through five doors nobody had shut. They
are withheld now rather than backdated, because there is nothing to backdate to: GDACS's hazard lists are
flagged *current* rather than queryable by date, and the aurora is a forecast for the next few minutes. No
keyless feed here can say what was burning on a Tuesday in July.

That makes this an *earthquake* archive, and the banner says so - because absence is the one thing a viewer
cannot notice. A globe with no storms on it looks like a calm day, not like a layer that was withheld.

**And the still said "Live" about a day in July.** When the archive shipped, the clock behind the caption was
made archive-aware, so the stamp was correct and the word in front of it was a flat falsehood - on the one
artefact in this app designed to be looked at away from the app, with nothing around it to correct the
claim. `stillMoment` now takes whether the app is archived and names the day instead. A *held* moment needs
no word either way, which is why that branch was already honest and stays untouched.

The pattern in both is worth naming: a mode is only as isolated as its least-guarded input, and the
guarded one is never the one that bites. The earthquake feed got a designed stop; the five that mattered
just as much got nothing, because they were never part of the sentence I was thinking about.

## The five layers, as a list you can reach

Making the marks clickable gave them a pointer and nothing else. There was no list of storms or fires
anywhere in the chrome, so a keyboard user could not reach a single one of them, and nobody could browse
them - the earthquakes have had the rail's own list since the beginning. Same argument the activity strip's
bars won when holding an hour stopped being mouse-only, and I had just re-created the gap one layer over.

**Ordered by the question each layer invites.** Storms by peak wind, fires by burned area, floods and
volcanoes by recency - because "how bad", "how big" and "how recent" are what those feeds are about, and an
alphabetical list of a hundred fires answers none of them. Floods carry no measure column at all, because
this feed files every one as magnitude zero and a rank would imply a severity that does not exist.

Rows use `kind:id`, the same identity the globe picks by, so the list and the glyph cannot disagree about
what a thing is - clicking either opens the same card. Built from the gated `onGlobe` set rather than the
raw feeds, so an archived day withholds the list along with the layers instead of offering rows that point
at nothing.

**Two placement bugs, both about conditionals I did not read.**

The rationale comment went in front of `<div data-rail="regions">`, inside a ternary, which makes two
sibling expressions where JSX allows one - ten cascading syntax errors from a comment. It lives inside the
block now.

Then the list rendered nowhere, while the legend beside it happily described four storms. The regions column
is gated on `regions.length > 0`, so putting the hazard list inside it quietly tied the five layers to the
earthquake feed: with USGS and EMSC still answering, the storms were on the globe and the list of them was
not in the DOM. The column opens for either kind of thing now, and the search box and region rows keep
their own gate. Placement inside that column is still deliberate - the 768-1279px strip is a four-column
grid with every cell named, and an unnamed sixth block would auto-place into a new row and make the strip
taller, which is what the "globe always gets a real share of the screen" test exists to catch.

## The link finally carries which storm

The link already said where, when, which earthquake, which slice and which moment. It did not say which
storm, because mark selection arrived after the link did - the same gap the archived day had, two features
apart. "Look at this cyclone" is exactly the kind of thing somebody sends, and until now the recipient got
the globe and had to hunt.

`k=cyclone:1001305`, the agency's own id, the way `e=` carries the agency's earthquake id. Validated on the
**kind** and not on the whole string, because the id half belongs to GDACS and this app has no business
guessing its shape - which also means an id containing colons survives, since the split takes the first one
only. An unknown kind is dropped at the boundary rather than handed on to resolve to nothing.

A mark that has since dropped out of its feed simply has no card. That is deliberate: the alternative is a
link that resurrects a storm which has blown out, and `findSubject` already returns null for exactly this.
Nothing in the chrome opens either - the rail's disclosure stays closed, because the link should restore a
view, not rearrange somebody's panels.

**A day and a mark cannot both be honoured.** An archived day withholds the five layers, so `k=` is ignored
when `d=` is present rather than resolving to an empty card. The link the app then writes has no `k=` at
all, so what you copy back out matches what you are looking at.

## The failure that cost a suite run to read

A background run reported four interaction failures and one design flake. All five pass, in isolation and
in two full clean runs - the run had started against a spec file about a hundred and thirty lines shorter
than the one on disk, so its line numbers pointed at tests that had since moved. The lesson is about the
report, not the tests: a stale run is indistinguishable from a real regression unless you check that the
line numbers still land where the names do.

The flake was worth something though. It read:

    expect(locator).not.toHaveText(expected) failed ... Error: element(s) not found

Forty-five seconds of nothing, then a message about the counter, when what had actually happened is that
the page was gone - `not.toHaveText` against an element that does not exist waits out its whole timeout
and then reports the absence as if it were the assertion. Diagnosing that cost two full suite runs.

`waitForData` now asserts the rail is attached first, on a short timeout, and both specs import the one
copy instead of each keeping its own. A dead page fails in twelve seconds saying "the rail never rendered:
the page probably threw on load" - verified by pointing it at `about:blank`, because a diagnostic nobody has
seen fail is a diagnostic nobody knows works.

The same run finally covered what it was built for: all sixty-two tests against `dist`, fifty-five passing
and seven skipped for the dev hooks they need. That had only ever been run three cases deep.

**Left standing, measured, not fixed here:** `plates.json` is imported dynamically by
`boundaryDistance.ts` and statically by `section.ts` and `plates.ts`, so the dynamic import buys nothing
and all 28K sits in the main chunk regardless. The code implies a laziness it does not have.

## Two dynamic imports that never deferred anything

The build had been saying this out loud for a while:

    plates.json is dynamically imported by boundaryDistance.ts but also statically imported by
    section.ts, plates.ts, dynamic import will not move module into another chunk.

The cause was one line of `manualChunks`: everything under `/src/geo/` was assigned to a `land` chunk, and
**a manual chunk assignment overrides dynamic-import splitting**. That rule exists for a good reason -
section 11 wants geometry measured on its own budget line rather than hidden inside a total - so a decision
about *measurement* had quietly become a decision about *loading*.

Two files were affected and they needed opposite fixes, which is the whole point of looking rather than
applying one rule to both.

**`plates.json` should never have been lazy.** Its comment claimed 28kB had no business in the first paint,
but `scene.ts` calls `buildPlates()` while building the scene, so the same file is drawn on the first frame.
It was in the preloaded chunk either way. The dynamic form bought a promise, an extra render with no
distances in it, and a comment that read like a measurement. It is a static import now and
`loadBoundarySegments` is `boundarySegments`, synchronous: 1,872 vertices flatten in well under a
millisecond, and the panel has its distance on the first render instead of the second.

**`plateMotion.json` should have been lazy and was not.** It is imported only by `await import()`, behind
the arrows toggle, and its comment said "as its own chunk" twice. It was in `land`, and `land` is
modulepreloaded, so every visitor fetched 7kB of arrow data whether or not they ever asked for arrows. It is
excluded from the grouping by name now, which is enough for Rollup to give it the chunk it always claimed.

The payoff is measured, not asserted:

| | before | after |
|---|---|---|
| `land`, gzip, preloaded | 42KB | **39KB** |
| `plateMotion`, gzip | in `land` | **2KB, on toggle** |

Which also means the geometry budget was **over its 40KB line at 42KB** and nothing had noticed, because
the number in DESIGN.md was recorded once at step 2 and never taken again. Confirmed at runtime against the
built output: five chunks on load with no `plateMotion` among them, and `plateMotion-*.js` appearing in the
resource timeline only after the arrows toggle - with the legend then reading "101 of the 231 are closing,
and the fastest runs at 227 mm a year", so the chunk is feeding real data and not just arriving.

## The blueprint pass, and where the prose went

Three steps, gated on screenshots, after the request for something simpler and cooler and "kinda like a
blueprint". The two halves of that turned out to be one move: a drafting sheet does not stack paragraphs
down a column, it frames values and annotates the drawing.

**The rule was a ceiling, not an absence.** `design.spec.ts` enforces chroma, meaning
`max(rgb) - min(rgb)`, at or under 55 on every painted element outside the canvas and the legend. Measured
live, the palette was 8 colours topping out at 37, and the blue sat entirely in the dim tones while the ink
a reader actually looks at, `#e8edf5`, used 1,111 times, measured **13**. That is why the app read grey. The
ink is `#d6e4f7` now at 33, body `#9fb4d0` at 49, and `faint` `#6f80a4` at 53. A true cyanotype cyan
measures **125** and would need the rule changed rather than used, which is why this pass is drafting
annotation and not a literal blueprint.

`faint` was at contrast **2.97** against the deck, which fails AA for normal text, and it is what "REGIONS",
"GO TO A DAY" and "24h ago" are painted in. It is 4.69 now. That was luck rather than intent, and it is the
most concrete thing the palette step bought.

**The geography moved hue without moving luminance.** Every globe colour is its old chroma times 1.6 at held
luminance, solved rather than picked, so the order `scene.ts` argues for survives exactly: sphere, land,
graticule, coast, plates. Hue is banded to slate, because letting green collapse onto red produced a violet
coastline at the same chroma. Holding luminance is what makes this safe: mark-versus-ground contrast is
**unchanged to plus or minus 0.00** on every pair, including the colourblind ramp's blue low end, because
luminance is what decides separation. Worth recording separately: cividis's lowest stop over land sits at
**1.08**, so the smallest magnitudes in that ramp were already near-invisible before any of this.

Two bugs from the palette step, both found by looking rather than by a test. `COLOR_VOID_C` in the shader
still held `0x070b14` after `--color-void` moved, so the canvas faded to a ground the page no longer
painted: two copies of one decision, and only one of them got changed. And `--color-coast` and
`--color-plate` are read as *chrome* text by the cross section, where the new canvas values would measure 70
and 78 and fail the ceiling, so those tokens deliberately do not follow. Chrome quoting the drawing
approximates it.

**The title block.** Four rail blocks with zero controls, 166px of sentences above the first thing anyone
could touch, are now one framed unit: count, largest, then ON EDGE and BAND as labelled cells, with the
argument moved to a NOTES row. `quietNote` split into `quietParts` plus a sentence so the percentage sits in
the cell and the reasoning stays in the note, rather than the rail stating the number twice. The existing
unit test caught that split on the first run, which is the test doing its job.

One bug of mine there: BAND rendered ungated, so before any data landed the block framed "BAND 100 km"
beside "Asking USGS and EMSC for the last day", which is a unit for a measurement nobody had taken. Both
cells are gated together now, since the band is the percentage's unit and means nothing alone.

**The frame came down to a hairline.** Drawn in `faint` it was heavier than every other line in the rail
and read as the loudest thing in a column it is only there to organise: the eye went to the border rather
than to the count inside it. At `--color-hairline` it matches the weight of the rules it sits among, and one
value draws the frame and the cell dividers both, because the 1px grid gap shows the container through. The
corner ticks stayed one step above at `faint` rather than dropping with it, since a tick at the frame's own
weight marks nothing, and `dim` against a hairline was a ten-to-one jump.

**The legend wall, measured.** Six layers each printed a full paragraph, all expanded at once. Collapsed to
key rows the block is **267px against 1,419px**, an 81% cut, and 1,419 is not an estimate: it is the same
rows with every disclosure forced open, which is exactly what the old legend was.

No copy was rewritten to get that. Every note already opened with the line a key wants, because each was
written to lead with what its glyph is, so `splitNote` takes the first sentence and the rest becomes the
body. The split is on a full stop followed by whitespace, so the decimals and percentages these sentences
are full of are not read as sentence ends. A note with nothing after the first stop renders flat, because a
disclosure with nothing behind it is a control that lies about having more to say.

This is the one place the pass touches a stated rule rather than a stated reason. PLAN.local.md says no
layer ships without the thing that explains it. The explanation still ships with the layer, one press away
instead of filling the rail, and `details` was chosen over a button with state precisely so the row stays
keyboard-reachable without inventing a path for it. The interaction suite's two legend tests pass unchanged,
including the one that reads what a ring is.

## The polish pass, and the layout the title block broke

Auditing the blueprint pass at 375, 768 and 1024 rather than only at the width it was designed on, which
found a regression I had shipped two steps earlier and the suite had not.

**The strip grid names its cells, and mine were not among them.** The 768-1279 rail is a four-column grid
with `grid-template-areas`, and the rules that place them match *direct children*: `.rail > [data-rail=
"headline"]`. The title block wrapped headline and largest inside itself, so both selectors stopped matching
anything, both the block and its notes fell to `grid-area: auto`, and they auto-placed into column one. The
activity strip, still pinned to its named area in the last row, was pushed to **349px inside a strip 348px
tall**: the histogram, the day field and the transport all went below the fold.

Nothing failed. The reachability test allows a scrollable ancestor and this rail scrolls, so "reachable" was
still true; the globe still got its share of the screen. This is the same lesson the strip grid already
carries in a comment - an unnamed block auto-places and makes the strip taller - and I walked into it from
the one direction the comment did not describe, by renaming the children rather than adding one.

Naming the new cells moved activity to 389, which was worse: four rows in one column. What actually fixed it
was moving the notes out of that column entirely, to a row spanning all four, which is where a drawing sheet
puts notes anyway. In a 110px column they were 125px of prose three or four words to a line; spanning the
sheet they are two lines. Activity came back to **245**, inside the fold.

**Two labels that were starving the values they name.** Both had the same shape and neither was visible at
desktop width.

The largest-event row was label, magnitude, place and age on one baseline, so at 768 the place got what was
left after three fixed-width siblings: "Flores Sea" rendered as **"Flor…"**, and the place name is the whole
point of the row. It is label-over-value now, the same shape the cells beside it already used, so the name
gets the full width at every size.

The day field was `Go to a day`, an input, and `go` on one row. The input took what was left, which at 768
was **60px**: a date field showing "mm / d" and a calendar icon, unreadable and under the touch minimum. A
native date input's width floor is set by its own locale, so the label moved to its own line and the field
took the row.

**The phone header was an L.** The control group wraps to two rows at 375, which is a decision defended in
place - a second row costs less than a button nobody can press - but `items-center` then floated the
wordmark between those two rows, diagonally opposite an orphaned "Still". Scoped to `max-md`, where the wrap
actually happens, so every wider header keeps the centring it was designed with.

**A note on the suite, because the numbers looked alarming.** One full interaction run reported 5 failures
in **41.9 minutes**, against 5.8 for the same suite an hour earlier. All five passed in isolation, and a
re-run passed **39 of 39 in 6.0 minutes**. Load average on the machine was 12.7. So the entry above claiming
the browser gate's load sensitivity was closed is **too strong**: waiting for motion to stop fixed the camera
assertions, and these five have some other timing dependency that a 7x-loaded machine still finds. Recorded
rather than fixed, because the cheap tell is real: an elevated runtime is the signal, not the failure list.

**And 7x was the wrong number, measured on 2026-08-24.** A run of 13.5 minutes - **2.2x** the 6.2 baseline,
nowhere near 7x - failed two cases (`the globe is operable from the keyboard` and `the rail resizes in both
directions`), and both passed in **1.1 minutes** run on their own. So 7x was one observation written down as a
threshold, and the honest reading is that any runtime meaningfully above baseline invalidates a failure list.
The machine was hosting a dev server and being polled for progress during the run, which is the ordinary state
of this laptop rather than an unusual load.

The **heap gate belongs on that list too**. It failed once during this pass and then passed 722 of 722 on an
immediate re-run with nothing changed between them. Its budget is an absolute 5MB of drift, which is exactly
the shape the CPU gate abandoned when a millisecond threshold failed three times on unchanged code: an
absolute number cannot tell a regression from a busy machine. The CPU gate's own fix - measure a reference
workload in the same process and budget the ratio against it - is available here and has not been applied.

## The poster had a setup and no punchline

The still is the only thing this app makes that gets looked at somewhere else. Its caption was three
things: the words EVERYTHING IS FINE, a timestamp, and a URL. The claim, the time, and where to buy
tickets. Nothing on it said what was actually happening, so the deadpan had nothing to be deadpan *about*
and the image read as a title card rather than a joke.

    EVERYTHING IS FINE
    120 earthquakes. 5 cyclones. 100+ fires. 15 floods.
    Live · 2026-08-22 19:50 UTC        M2.0+ · last 24h

One line. Every number was already in the snapshot; none of it was new work, it had simply never been said.

**Two things the line refuses to say, both for reasons this app already argues.**

*Volcanoes are left out entirely*, even though triangles are visible on the globe above the caption. GDACS
flags none of them current and the newest episode is usually weeks old, which is why `volcanoNote` leads
with the age rather than the count. A poster stamped "Live" is the worst possible place to let a triangle
pass as an eruption, so every number on this line is a right-now number.

*Fires take a `+` when the feed is capped.* The wildfire feed stops at 100 and one country can fill it
alone, so a flat "100 fires" would state a floor as a total on the one surface where nothing is around to
correct it.

**It shipped blank the first time, and only looking at the artefact found it.** The evidence line came out
empty because `saveStill`'s dependency array was the filter and the cursor: complete while the caption said
only what the picture was *of*, and wrong the moment it also said what was *in* it. The callback closed over
the first render and computed a verdict from an empty planet. Nothing failed - a blank line reads as a
design choice.

The obvious fix is not available: `headline` is declared several hundred lines below `saveStill`, so naming
it in the dependency array is a use-before-declaration, and tsc says so. So the counts are a latest-value
ref mirror assigned during render, the same pattern `Globe.tsx` keeps for `live` and for the same reason. It
is also the more correct answer: a still should state what is on screen when the button is pressed, not what
was on screen when the callback was last rebuilt.

It mirrors `headline` rather than the raw window total, because while the entrance is replaying or the cursor
is parked the rolled value is what the globe is actually drawing, and a poster claiming the window total over
a half-drawn planet is the lie the replay counter was added to stop.

**Not added to the app itself, against my own stated plan.** The intention was the verdict in the title block
too, and it is redundant there: the header already says EVERYTHING IS FINE, the title block already carries
the count, and the hazard list already totals the other four layers. In the app the evidence is on screen
already. The still is the only place it travels alone, which is the only place the line earns its words.

## Hover, on the four layers that never had it

Clicking worked on all five layers. Hovering worked on one. So the storms, volcanoes, fires and floods had
no feedback of any kind, including **no pointer cursor**, which means nothing on screen said a spiral or a
triangle could be pressed at all. That gap arrived with mark picking: the click path was taught about marks
and `onMove` was not.

`hovered` is tagged now, `{ kind, id }` rather than a bare string, because a quake key and a mark id are
different namespaces that both contain colons - the same reason the app keeps them as separate selections
instead of one field that could be either.

**The label rides on the mark.** `Mark` gained an optional `label`, set where the marks are built, because
this file knows about polylines and anchors and has no business knowing what a cyclone is. One `locate`
resolves either namespace to a position and a label, so the ring and the tooltip stopped caring which layer
they are pointing at. Every label follows the rule its own legend row follows: a storm gets GDACS's wind
number and never their word for it, a fire gets area in the legend's unit, a flood gets **no measure at all**
because every flood in that feed is filed as magnitude zero, and a volcano gets no date because the one
thing that has to be said about a volcano is a sentence rather than a tooltip.

**The distance line stops at the kilometres for a mark.** With an earthquake pinned, hovering another shows
the gap and the P-wave arrival time. Those seconds are a wave travelling through crust between two
epicentres, so a cyclone has no arrival time at an earthquake: a mark gets the distance and nothing else.
Printing the seconds there would have been a measurement of something that does not happen, and the pair
code would have produced one happily.

**Verified by pointing at things.** A DEV-only `__marks` hook was needed to do it: the hazard feeds are live
even when the agencies are stubbed, so no test can hard-code where a storm is. Volcano gives
"Mayon · Philippines", fire gives "Russian Federation · 102 km²", flood gives "India", all with a pointer
cursor, and an earthquake still gives "M 2.4 Near The East Coast Of Honshu, Japan".

Two of my own probes were wrong before the app was: I read the cursor off the canvas's parent when the
handler styles the canvas, and I matched the magnitude with `/M\d/` when the tooltip renders "M 2.4" with a
space. Both looked like product failures for a minute.

## The word pass, measured on what stays on screen

"Fewer words" is not a count of the copy, it is a count of the copy that is *visible*. Everything in the
legend is a folded row now, so what a reader actually faces is the eight heads plus the notes line, and
three of those held half of it.

| head | was | now |
|---|---|---|
| notes | 31 | **19** |
| rings | 24 | **14** |
| fire | 20 | **10** |
| aurora, volcano, flood, depth, cyclone | 59 | 59 |
| **always visible** | **134** | **102** |

A 24% cut, and **nothing was deleted**. The fire head lost its area and its median days to the body behind
the disclosure it already had, which took one comma becoming a full stop, since `splitNote` breaks at the
first sentence. The rings head lost the playback multiplier and what the gap measures the same way.

The notes line is the one place words actually went. It restated the band and the percentage that the ON
EDGE and BAND cells already print, then closed with "the rest of the planet had the day off": 31 words to
carry one ratio. It reads as a note on the cells above it now, which is what a NOTES row is for. The
flourish moved to the still, where the deadpan is the entire job and there is nothing else on the image to
carry it, and a test asserts it does not creep back into the rail.

**The hover ring grew for glyphs.** 20px is a ring around a marker, whose dot runs 3 to 15px. A spiral, a
triangle or a flame is already that size, so the same circle landed *on* the glyph rather than around it
and read as part of the drawing. 34px for a mark, unchanged for an earthquake.

## The key was the biggest thing on the smallest screen

An audit at 375, the breakpoint that had had the least attention. The page does not scroll and nothing
overflows sideways, but the rail is a **240px window onto 1,403px of content**, and the blocks came out in
this order:

| block | height |
|---|---|
| legend | **448** |
| activity | 234 |
| regions | 207 |
| title block | 191 |
| recent earthquakes | **132** |

A key that is read once was a third of the rail and **3.4 times the height of the list of earthquakes that
are actually happening**. So the key starts folded unless the rail runs the full height of the window.

**The threshold was wrong the first time, and wrong in the instructive direction.** `min-width: 768px`
reads as "fold it on phones, open it where there is room", and the 768-1279 band is where there is *least*
room: the rail is 34dvh there, 348px on a 1024-tall screen, and the key measured **719px** in it. That is
2.1 times the visible height, worse than the phone's 1.9. The first fix therefore left the worst case in
the app untouched while looking like a fix, and only measuring the other breakpoints caught it.

The rail stops being a strip at 1280, so that is the line. Measured after:

| width | legend | rail content | visible |
|---|---|---|---|
| 375 | 448 → **129** | 1,403 → **1,110** | 240 |
| 768 | 719 → **144** | 898 → **565** | 348 |
| 1024 | → **129** | → **553** | 261 |
| 1440 | unchanged | 945 | 854 |

At 1440 the legend is not in the rail at all - it floats over the canvas with its own space - which is the
same fact from the other side: the key is only open where something can afford it.

**A stored answer wins in both directions**, because somebody who folded it away or opened it up has said
what they want and a screen width is not an argument against that. The width only decides a first visit,
and it is read once at mount rather than on resize, since re-deciding on a window resize would overrule a
choice already made.

**The write moved from an effect to the press.** As `useEffect(..., [keyOpen])` it fired on mount and
persisted the width-derived default, so a phone's first visit saved "closed" as though it had been chosen,
and the paragraph above promising that a stored answer wins would have been describing its own footprint.
Verified by assertion rather than by reading it: the phone starts folded with **nothing in storage**, a real
press writes `1`, and that survives a reload.

**Also checked and found correct, which is worth recording because it was an assumption.** Seven legend rows
became `summary` elements this session, and I had assumed the universal `:focus-visible` rule covered them.
Walking the tab order found **37 focus stops and no element without a ring**. The assumption held; it is
measured now.

## An archived day carries all five layers, from a different upstream

The archive shipped earthquakes only, and the rail said so: "storms, fires, floods, volcanoes and the aurora
are live feeds with no history to ask for." True of the feeds the app had, false as a claim, and it left an
app named for everything the Earth is doing showing a quarter of it on every day but today.

**GDACS cannot do this, and it looked like it could.** Its event list takes `fromdate`/`todate`, and one
storm came back for a day in July, which is where I stopped the first time and told the user this was
buildable. It was not: the filter runs over the *current* event pool, not an archive.

- a year-wide query returns the same 15 fires as no filter at all
- 2026-05-15 returns **nothing** for storms, fires and floods, while 2024-08-01 returns two fires
- `eventlist=VO` with dates answers **204 No Content**
- the separate `ARCHIVE` path ignores the dates and hands back today's list, one row stamped `iscurrent: true`

What looks like history is a handful of long-running current events overlapping the date asked for. Drawing
it would put one storm on a day that had many and nothing at all on most days: the unlabelled-sample-data
lie section 10 forbids by name, and the same trap EONET was rejected for the first time round.

**NASA EONET v3 is a real archive**, and the app's own notes had ruled EONET out for the opposite problem.
`status=open` does not mean active, which made it wrong for a *live* layer; history is where its dates stop
being a trap and become the point. Measured: `start`/`end` honoured (six events for 2024-08-01, thirty-four
for 2026-05-15, disjoint sets), 14-24kB per day, Point geometries, `closed` and `magnitudeValue` on every
event, keyless, `access-control-allow-origin: *`. **v2.1 is unusable** - it ignores the range and returns
18.5MB, which timed out at 30s.

**It is not a rival dataset.** EONET's sources for these categories are IRWIN and **GDACS itself**, so an
archived day is the live layer's own provider plus a second one, held historically by NASA. Global rather
than the US bias the IRWIN name suggests: 17 North America, 7 Asia, 4 Oceania, 3 Africa on a sample day.

**Four things the mapping had to get right.**

*Units.* JTWC publishes storm wind in knots and IRWIN publishes area in acres; the app states km/h and
hectares. A storm reading 35 anywhere is knots passed through raw, and a test asserts 80kt is 148km/h.

*Tracks are clipped to the day.* A storm's geometry is 11 to 25 samples over its life, so an unclipped track
would show on an archived Tuesday where the hurricane went on Friday. The position is the last sample inside
the window and the peak is the peak inside it, which is what the live layer's number also means.

*Tense.* The layer sentences said "running now" and "burning now" - the one thing a past day makes false.
The archive used to withhold these layers so the copy was never wrong; now it reads "the flames are forest
fires **that burned that day**". The wildfire feed's hard cap of 100 is a fact about GDACS, so the "count is
a floor" caveat is suppressed on an archived day where the cap is ours and never hit.

*The aurora stays withheld, permanently.* NOAA publishes a predicted oval for a stamped minute. A forecast
has no past to ask for, so that clause in the rail was right all along and now says so on its own.

Verified in the browser on 2026-05-15: 20 fires and a flood drawn, `USGS 221 · EMSC 29 · EONET 21` in the
archive note, corrected tense in the legend, and no aurora row.

**Left standing:** the headline still reads "last 24 hours" on an archived day. It is not wrong - the window
does end at the archived day's end - but it reads as now, and the only reason it stays is that the archive
banner directly beneath it states the day and says nothing is arriving. A second statement would be words.

## Two things the archived layers broke, both about tense

Drawing storms, fires, floods and volcanoes on a past day made copy false that had been safe for as long as
the archive withheld those layers. Found by opening the app on 2026-05-15 and reading it, not by a test.

**The mark card was still saying "now".** The legend sentences got the tense treatment when the feature
landed, and the card did not: "Tropical cyclone, running now", "Forest fire burning now", "Flood running
now" - on the one surface somebody opens *because* they want the detail. All four take the flag now, and the
volcano's refusal holds in both tenses, "not erupting now" and "not erupting then", because that is the
claim the layer must never make either way. The rows are untouched and a test says so: a measurement is a
measurement whichever day it is from.

The layer sentence had the same crack one level down. "so none of this is erupting this minute" is a claim
about *now* printed over a picture of *then*.

**The still named the wrong day, and that is the copy that leaves the app.** `dayRange` returns an
**exclusive** end - `from + 86400000`, the next midnight - and `clockAt()` hands back that end, so a still of
2026-05-15 captioned itself **"Archived day · 2026-05-16"** while the rail beside it said the 15th. Two
places, one day, two answers, and the wrong one on the only artefact designed to be looked at away from the
app. It takes `archive.from` now.

The test for it went on the span rather than on the caption, because the fault is the shape of the span: any
future reader deriving a date from `to` gets the next day. Pinning `from`/`to` as 05-15/05-16 says that out
loud where the next person will meet it.

**One thing that needed no work and is worth recording.** The still's verdict line already counts from the
gated `onGlobe` set, so an archived still states that day's evidence with no archive-specific code:
"100 earthquakes. 20 fires. 1 flood." over "Archived day · 2026-05-15". The two features met correctly
because both were built against what is drawn rather than against what is live.

## The bluer globe cost the colourblind ramp, and luminance could not see it

Found by opening two states I had changed and never looked at: the flat map, and the colourblind ramp. The
map was fine. The colourblind ramp was not, and the reason is a hole in my own measurement.

When the geography went bluer I held luminance exactly and reported mark-versus-ground contrast as
**unchanged to a hundredth**, which was true and incomplete. Contrast is a luminance ratio. Moving the
geography toward blue moved it toward the half of the wheel cividis lives in, so **perceptual** distance
fell while contrast did not move at all:

| mark vs ground | before | after |
|---|---|---|
| cividis 2nd stop vs plate lines | 12.0 dE | **9.3 dE** |
| cividis low stop vs land | 16.3 dE | **12.6 dE** |
| cividis low stop vs sphere | 24.8 dE | 22.5 dE |

Under about 10 dE two colours stop separating, so the second stop against the plate lines crossed the line.
The thermal ramp is warm and loses nothing; two of its pairs actually improved. No test caught this, and no
test could have: the chroma ceiling passes at 53, the contrast gate is a luminance ratio, and the only
symptom is that small marks are harder to pick out.

**So the geography follows the ramp.** `setGeography(ramp)` swaps the five materials between the blueprint
palette and the pre-blueprint neutral one, called from the same place the mark layers are re-ramped, so a
toggle and a cold load with the preference stored both get it - checked separately, because a returning
viewer never presses the button.

This is DESIGN.md section 3's argument running in the only direction left. That section says chrome must
survive *both* ramps, and read as "therefore no hue" it was over-strict: the real constraint is a ceiling,
which is what let the blueprint palette in. What is left once the ceiling is not the binding constraint is
the harder half of the same sentence, and it does not resolve to one palette. **The two ramps do not want
the same chrome.**

**The lesson is about the instrument, not the colour.** I measured the thing I had a number for. Holding
luminance was the right move and proving it held was worth doing, but reporting "unchanged to plus or minus
0.00" invited the reading that nothing had changed, when what I had shown was that *one axis* had not moved.

## A phone showed an archived day and said nothing about it

Auditing states rather than widths this time: the cross-section on both ramps, and an archived day at 375.
The section is healthy, and the token divergence recorded above reads as nothing in practice. The phone was
not healthy.

The header's status is one span, and it was **entirely** behind `hidden sm:inline` for header width. Below
640px an archived day was a faint dot and no words: a globe of last May with nothing on screen saying so
until you scrolled the rail past the fold to reach the banner. The comment directly above that span already
names this exact risk - "a chrome that goes on saying both feeds live over a globe showing last March" - and
the phone case is the same failure with less to argue with, because there is no wrong sentence to catch, only
an absent one.

**The two halves hide differently now, and the asymmetry is the whole point.** A status that says
"everything is normal" is reassurance, and the dot carries it, so the live phrase still folds on a phone. A
status that says "this is not what you think" is a correction, and absence is its failure mode, so the date
always shows. Ten characters on the header's second row, which was carrying one button and empty space.

**The test I wrote for it was wrong first.** `expect(head).not.toContainText("feeds live")` passed at 1440
and failed at 375, which reads exactly like the bug being present on a phone. It is not: `toContainText`
reads `textContent`, which sees straight through `display: none`, so it was asserting on a phrase nobody
could see. Rewritten against `innerText`. Worth recording because the failure pointed at the app and the
fault was in the instrument - the third time this session, after the cursor read off the wrong element and
the magnitude regex that did not allow for a space.

## One archived day, two clocks, both on screen

The tense fixes went to the copy. The *clocks* were still wrong, and the app was showing both answers at
once: the title block said **"Largest 13h"** while every row beneath it said **"99d"** and the panel said
**"99 days ago"** - one archived day, measured from its own end in one place and from today in another.

When archive mode shipped, eight `Date.now()` call sites in `App.tsx` were rewired to `clockAt()`. Those
were the *filtering* sites, and the display sites in `EventList` and `DetailPanel` were never touched
because they read the clock themselves rather than taking one. Both take `now` now.

**The neighbour search was the worse half.** `findNearby(store, quake, filters, Date.now())` filters
against the window ending at the clock it is given, so a pinned archived event was having its sequence
computed against a present it has nothing to do with. Nothing looked broken, which is why it lasted: an
empty or wrong neighbour list reads as a quiet day.

**Announcements keep the real clock, deliberately.** `newsIn` decides what genuinely just *arrived*, which
only happens while live - an archived day has stopped its sources. It also stays out of the effect's
dependency list, because the displayed clock ticks at 1Hz and an announcement effect rerunning every second
would be doing a full pass to answer "nothing arrived". The nearby memo keeps its existing
`exhaustive-deps` exemption for the same reason, and that is now written down beside it so the next reader
does not "fix" it: entering or leaving an archived day moves the revision anyway, since the store is
cleared and refilled.

**The bug was invisible under the test harness, and that is the part worth keeping.** `installFeeds` routes
`/seismicportal\.eu|\.geojson/`. The archive's USGS URL is `fdsnws/event/1/query?format=geojson` - no
literal `.geojson` - so it **misses the stub and hits the real network**, while the EMSC archive URL
`seismicportal.eu/fdsnws/...` **is** caught. So every stubbed archive test was mixing real events from the
archived day with fixtures dated near now, and the newest fixture sat at the top of the list reading "1h".
Two clocks agreeing on the wrong answer looks exactly like one clock being right.

It only showed with nothing stubbed at all. Worth remembering when the next archive assertion is written:
under `installFeeds`, an archived day is half real.

## Sweeping the last "now" out of an archived day

Three holdouts, each found by fixing the one above it and looking at the screenshot again.

**The headline said "last 24 hours" about 2026-05-15.** Left twice on the argument that the banner beneath
it names the day, which was true and stopped being sufficient once the header, the still and every age had
been taught the archived day's language: it was the only line still describing a distance from now. It says
**"the whole day"** - three words rather than a fourth copy of the date, and always accurate rather than
conveniently so, because the window buttons are 24h, 7d and 30d and the archived span is exactly one day,
so every option covers the whole of it.

**The activity strip's axis said "24h ago … now".** It reads "day start … day end".

**The transport said "live".** The unparked cursor sits at the right-hand edge of the span, and on an
archived day that edge is the end of that day, not the present. Also "day end".

**Then I checked what was left rather than assuming.** Three uses of "now" and "live" survive on an archived
day and all three are correct: "Nothing here is arriving now" is a true statement about the present and the
banner's whole job, "back to live" is an action, and "the live feeds" is a noun. Worth writing down so the
next sweep does not clean up the ones that were right.

The pattern across the whole archive thread: **a label that names the present is a claim, and every one of
them has to be found separately.** The copy, the ages, the neighbour window, the axis and the transport were
five different places holding the same assumption, and each was invisible until the one before it was fixed.

## Closing the hole in the harness that hid the clock bug

The tour first, since it had never been opened: it survived the title block restructure intact. The
narration replaces the window label in the wide cell - "2/6 Japan & Kurils · 30 events" - the counter
advances, the block height stays at 191px so nothing jumps, and stopping restores "last 24 hours". That
narration is what makes the camera movement legal under the motion rule, and it is doing its job.

Then the actual work: **archive tests were reaching the real agencies.** `installFeeds` routed
`all_(day|week|month).geojson`, `all_hour.geojson` and the `seismicportal.eu` host. The archive asks
`earthquake.usgs.gov/fdsnws/event/1/query?format=geojson`, which contains no literal `.geojson`, so USGS
archive requests **missed every pattern** while the EMSC one was caught by the host rule. Every archived-day
test ran on real events from that day mixed with fixtures dated near now, the newest fixture sat at the top
of the list, and that is exactly how a wrong clock read "1h ago" and hid for two turns.

One route on `/fdsnws\/event\/1\/query/` closes it, and two details matter more than the pattern:

**It is registered last, and it hands back what is not its business.** Playwright checks routes in reverse
registration order, so the broad `seismicportal.eu` rule would otherwise keep catching the EMSC archive
query; placed first, the fix silently does nothing for one of the two agencies, which is the same half-real
state it was written to remove.

Registering it last then broke a different test, and the reason is worth keeping: **EMSC's live seed uses
the same endpoint.** `seismicportal.eu/fdsnws/event/1/query?limit=600&format=json&start=...` is the seed;
the archive asks the same path with `starttime` and `endtime`. Claiming every `fdsnws` request replaced the
capped seed fixtures that "the chrome says how far back each agency actually covers" depends on, and it went
red. The route now falls back unless both archive parameters are present and span a real range. A pattern
matched on the path was never going to be enough when two different features share it.

**The fixtures are dated inside the requested day**, spread from `starttime` to `endtime`, not near now.
That is the whole point: an archived day whose events are dated today cannot tell a correct clock from a
broken one. Verified by routing everything at the agencies through a spy: the only outbound host left is
`eonet.gsfc.nasa.gov`, which is the hazard archive and stubbed by nothing.

**Left as it is, deliberately.** With the newest fixture sitting exactly on the day's end, the top row reads
"just now" - `ago` returns that under 45 seconds, and on an archived day the word does double duty. It is
wrong for the last 45 seconds of an archived day, which is 0.05% of it, and correcting it means threading an
`archived` flag through `ago`, `agoShort` and every call site in the rail, the panel and the cards. That is
disproportionate to the window it fixes, so it is recorded rather than done.

## The strip framed nothing and did not say so

The magnitude filter goes to 7.5+, which any viewer can reach in one drag, and on a normal day nothing
passes it. Most of the app handles that well: the title block collapses to the count and its window label,
the notes row and the largest-event row disappear because they have nothing to state, and the rail says
"No events match the current filters."

The activity strip did not. Every bucket draws a 1px floor when its count is zero, so the strip became
twenty-four slivers under an axis labelled "24h ago … now": a frame around nothing, which reads as a
rendering fault rather than as zero. The peak readout beside it was an **empty string**.

It says **"nothing in this window"** there now, which costs a line that was already blank and is the same
fact the rail states forty pixels below.

**The first version of it was wrong, and the app already knew why.** `fetching` is the only other state in
that readout, and it means a pending *window change* - not the first load. So at first paint `fetching` is
false while the strip is genuinely empty, and the message would have claimed nothing **matched** when in
fact nothing had **arrived**. The rail has drawn that distinction since it was built: "Waiting for the first
events" against "No events match the current filters". The readout takes `waiting` now and stays silent
until some feed has vouched for the window.

Asserted in all three states rather than the interesting one: silent feeds say nothing, a populated window
says "peak 13 · 17h ago", and an empty one says it is empty.

## A thousand requests a run, for data no test looked at

The accessibility layer first, since it had never been examined and its clock changed two turns ago. It is
sound: no unlabelled controls, no image without alt text, the canvas correctly `aria-hidden` with the rail
carrying its content, and the announcement reads "Magnitude 6.4 earthquake, Flores Sea, just now, 10 km
deep, reported by USGS." An archived day announces **nothing**, which verifies the decision to leave
`newsIn` on the real clock rather than merely arguing it: `newsIn` gates on `now - eventTime` inside a news
window, and archived events are months outside it.

Then the measurement that mattered. A known limitation written last turn said EONET was "the only outbound
host a stubbed run still reaches". That was measured with a spy patterned on the three hosts I expected to
see, which is the third time this session that measuring only what I had a number for produced a confident
wrong answer.

Patterned on everything external instead:

| host | requests, one test |
|---|---|
| www.gdacs.org | **14** |
| services.swpc.noaa.gov | **2** |

Roughly a thousand GDACS calls per suite run, across sixty-two tests, for data **no test asserts on** - a
grep for the layer sentences across both specs returns nothing. Every browser test was depending on two
third-party services being up and fast, which is a plausible share of the flakiness and runtime that has
been put down to machine load.

**Fixtures rather than empty responses.** The layers still draw - one storm with a track, one volcano, one
fire, one flood, an aurora band - so screenshots taken for visual review keep showing a spiral, a triangle,
a flame and waves, and show the *same* ones every run. EONET is stubbed too, dated inside the requested
range for the reason the earthquake archive is.

**The aurora fixture failed silently first, which is the shape worth remembering.** `parseOvation` checks
`rows.length === AURORA_LON * AURORA_LAT` and returns null on a mismatch, so a sparse 72-row patch parsed to
nothing and the layer simply was not there - no error, no failing test, just an absent legend row. The
fixture builds all 65,160 rows now. Its timestamp key was wrong too (`Observation Time` for `Forecast
Time`), which falls back to the fetch clock rather than failing: another quiet pass.

Verified by the spy seeing **nothing leave**, and the suites are green and slightly faster: design 2.3m,
interaction 5.7m.

## A dead hazard feed looked exactly like a quiet planet

A systematic sweep first, since the lesson of the last three turns is that I keep instrumenting my
hypothesis instead of the system. Console output across ten reachable states - pinned event, far side, map,
section, colourblind, globe, 30d, empty filter, tour, archived day, still - gave **zero errors, zero page
errors, zero failed requests**. Seven warnings, all WebGL driver messages. The one real GL error,
`glTexStorage2D: Texture is immutable`, appears exactly once per context whether the aurora is present,
refused, or every mark layer is off, so it is renderer initialisation and not app data. Chased and dropped.

Then the sweep asked a better question than I had. With all four hazard hosts refused: **zero marks, zero
legend rows, no hazard list, and the app says nothing at all**, while the header still reads "both feeds
live" - which is true, since that is the two earthquake agencies. But a viewer cannot tell "no storms today"
from "we could not ask", and this app states that distinction everywhere else: the archive prints "did not
answer", `History.answered` keeps "nothing happened" apart from "nobody answered", a dead earthquake feed
says so. The five live layers were the one place it did not.

The cause was one line in `fetchList`, which documented itself as "failing to an empty list rather than into
the app". True, and the empty list is indistinguishable from a quiet one.

**Reported through a callback rather than by returning a pair.** The data shape is consumed by memos and
state right through the app, and a status channel has no business changing any of that. Five fetches take an
optional `onAnswer`; nothing downstream moved.

**Three decisions in it worth keeping.**

*Optimistic until told otherwise.* A page that opened by listing feeds it had not asked yet would be crying
wolf, so every layer starts answered and a later successful poll clears a failure - a blip does not leave a
stale complaint on screen.

*A storm without its track is still a storm.* The cyclone fetch reports on the **list** request, because the
per-storm track call already fails softly by design, and a missing tail is not a dead feed.

*A null aurora grid counts as no answer.* `parseOvation` returns null for a payload that arrived and was
unusable, and from the viewer's side that is the same fact: the sky is missing, and not because it is quiet.

The line sits beside NOTES rather than in the legend, because the legend's rows are the very things that
vanish when a feed dies: an explanation of an absent layer cannot live inside the layer's own absent row.
Archived days withhold these feeds by design, so it stays out of their way. Verified in three states: all
four dead says "No feed answered for any layer, so none are drawn", the aurora alone says "No answer for the
aurora: absent here does not mean absent", and a healthy run says nothing.

## A rotated phone, and six probes that were wrong before the app was

Three shapes nothing had ever measured: a phone turned sideways (812x375), a short laptop (1280x600) and a
very short window (1024x420). Every sample of this app had been upright or wide, and 812 crosses into the
strip band, so a rotated phone gets the four-column layout in **375px of height**.

All three hold. Nothing overflows sideways, the page does not scroll, no control is unreachable, and the
canvas keeps 53% at both short shapes and 100% at the laptop. **Phone landscape is a shipped breakpoint
now**, so the four per-breakpoint guards cover it: the suite is 27 tests rather than 23.

**The interesting part is that my probe accused the app twice and was wrong both times.**

First it reported six unreachable controls at 1280x600 because it took `el.closest("[data-rail]")` as the
scrolling ancestor. That returns the *regions block*, which sits below the fold itself, so a row inside it
looked stranded while the rail that scrolls to it was on screen the whole time.

Fixing that to walk for a genuinely scrollable ancestor still reported them, because it stopped at the
**nearest** one - `.rail-regions`, whose own box is at y 660-792, entirely below a 600px viewport. The outer
`.zone-rail` scrolls that block into view, which `scrollIntoView` confirmed by moving the row from 675 to
307. Reachable all along.

The shipped design-suite check gets this right, and the difference is one keyword: it `continue`s past a
scrollable-but-offscreen ancestor and keeps walking, so **any** on-screen scrollable ancestor counts. Its
comment explains why the exemption must not be too generous; what it does not say, and now this does, is
that it must not be too *narrow* either. Both failure modes live in that loop.

**Six instrument faults this session**, which is the number worth remembering: the cursor read off the wrong
element, a magnitude regex that disallowed a space, `toContainText` seeing through `display: none`,
`getComputedStyle().font` returning empty, `saveAs("/dev/null")`, and now two versions of one reachability
walk. Every one of them pointed at the app. The rule that has earned its place: **when a probe accuses the
code, check the probe first.**

## The deferral that rested on the wrong denominator

`ago` returns "just now" under 45 seconds, and on an archived day that word claims the present about a
finished one. I deferred it twice, both times on the same arithmetic: 45 seconds is 0.05% of a day, so
threading an `archived` flag through `ago`, `agoShort` and their call sites was disproportionate.

The denominator was wrong. Nobody reads a uniformly sampled second of an archived day; they read the **top
row**, which is the newest event, and the gap from a day's end to its newest event is exponential rather
than uniform:

| events that day | top row says "just now" |
|---|---|
| 60 | 3.1% |
| 200 | **9.9%** |
| 400 | **18.8%** |

At this app's rates that is one archived day in five to one in ten showing a false present tense on its
most-read line, not one in two thousand. The cost estimate had not changed; it had never been right.

So it is done: "at the day's end", and "end" in the short form, reusing the words the activity strip and
transport already use for that edge rather than inventing a third phrase for one boundary. The flag reaches
the rail row, its screen-reader sentence, the largest-event row, the detail panel and the mark card, and
every longer gap is asserted byte-identical in both modes so the change cannot leak into live copy.

**The live half of the check was worthless first.** It asserted "just now" appears on a live day, against a
generated day whose newest event is minutes old - a 45-second window the fixture could not produce. Green
would have meant nothing and red meant nothing either. It injects a brand-new event now.

The lesson is narrower than the six probe faults and worth keeping separate from them: a deferral is a
measurement too, and this one was never checked.

## The one load-bearing method with no test

A code read rather than another behavioural sweep, since everything reachable has now been exercised.
`store.clear()` is the newest method in the most stateful file here and `showArchive` rests on it entirely:
it clears, then loads a past day, so anything it forgets is stale state a viewer reads as that day's data.
It had **no test**, among twenty-seven for the same store.

It is correct. Every mutable field is reset - slots, head, count, both indexes, the bucket map, the per-source
reading counts, corroborated, revised - and `arrivals` deliberately survives as a fact about the session
rather than the contents.

Asserted through the public surface rather than the fields, because a field this missed would only be a bug
if something could still see it: `size`, `newest`, `latest`, `forEach`, `stats`, `findByReading`, and a refill
afterwards to prove the ring starts from a clean head rather than wherever the last fill left it.

**One assertion earned its place beyond coverage.** `stats().since` goes null, and that is what makes an
archived day's loading state correct: `since` drives `coveredSince`, which drives "Waiting for the first
events" and the `waiting` gate added to the activity strip's readout a few entries above. Without it a fresh
archive load would inherit the previous day's coverage and the strip would say "nothing in this window"
about a window it had not finished fetching. Two features, built separately, meeting on one field that
nothing had tested.

**No defect found, and the honest framing is that this turn bought coverage rather than a fix.** Writing it
did cost three wrong guesses about the store's own API - `syntheticReadings` takes an options object,
`Ingested` exposes `isNew` rather than `revised`, `StoreStats` has no `arrivals` - which is the same lesson
as the probe faults one rung down: read the signature, do not assume it.

## Days worth seeing, which is the archive finally having a door

The archive could draw any day since the catalogues begin and its entry point was a blank `mm/dd/yyyy`
field: it asked for a date the viewer already knew, which almost nobody does. The largest feature in the app
was also the least reachable, so everything the app is good at was stuck on whatever Tuesday it is.

**Nothing new was built to make these days extraordinary.** Seven rows in a disclosure, each loading through
the `loadArchive` path that already existed. What they unlock was already there. On 2011-03-11:

| | a normal day | Tōhoku |
|---|---|---|
| events | 48 | **685** |
| largest | M6.7 | **M9.1**, "2011 Great Tohoku Earthquake" |
| on edge, within 100km of a boundary | 29% | **65%** |
| busiest hour | 11 | **51** |
| energy in one event | - | **97%** |
| revised by an agency | 0 | **1** |

The activity strip is a wall instead of a flat line, 539 of the 685 fall in Japan & Kurils, the aftershocks
stack visibly along the trench, and the two-agency reconciliation - the centre of this whole app - fires on
the largest earthquake in its catalogue.

**Every row was measured before it was written**, and `notableDays.live.test.ts` re-checks each magnitude
against USGS so a wrong label fails rather than sits there. A curated list is an assertion about somebody
else's data, and the failure mode is a label that is quietly wrong: the right day at the wrong magnitude
looks fine in a screenshot.

**Loma Prieta is the trap this feature is built around, and it is recoverable.** It is remembered as 17
October 1989 and catalogued at 00:04 UTC on the **18th**: asking for the 17th returns an M6.3 in Papua New
Guinea, and asking for the 18th returns **292 events under USGS's own name for it**. So it is on the list
under the 18th, which is the day the archive actually loads, with the banner saying "all day UTC" beside it.
Good Friday 1964 is the same story - 27 March locally, 03:36 UTC on the 28th. Both wrong dates are pinned
absent and both right ones pinned present, because the wrong one is what memory reaches for.

**Twelve days now, and the five added ones were each measured first.** Valdivia 1960 at M9.5, Prince William
Sound 1964 at M9.2, Maule 2010 at M8.8, Sea of Okhotsk 2013 at M8.3, Loma Prieta 1989 at M6.9. The live test
runs one case per row, so all twelve labels are checked against the catalogue rather than trusted.

Okhotsk earns its place on something other than size: it is **598 km deep**, and it is the only day here that
gives the depth encoding anything to draw. Solid is shallow and hollow is deep, and on a normal day the
legend reads "0 below 300" - that encoding has almost never had a subject. On this day it reads **9 below
300**, and one event is 99.5% of the window's energy.

**The two oldest rows needed a sentence, and that is the app's own rule rather than a nicety.** 1960 returns
**six events** at M2.5+ against Tōhoku's 685. Both numbers are true and the pair invites a false inference,
so the list carries one line: "Older days hold fewer events: the networks were smaller, not the planet
quieter." Nothing ships without the thing that explains it, and a sparse day is no exception.

Ordered largest first, because the two M9.1s are the reason to open it. Closed by default, because it is a
way in and not a menu: the field above stays the answer for anyone who arrived with a date in mind.

**Two probe faults again, in one test.** `button[aria-label*='magnitude']` also matches the largest-event
row, so the first click hit the wrong control; and the assertion read any date-shaped string out of the page
body, which matched the list's own rows. Together they reported a successful load that had not happened.
Scoped to the disclosure and asserted on the archive banner instead.

## Auditing the feature I had just shipped

Two findings, one real and one my own probe again.

**The list vanished the moment a day loaded.** It lived inside the archive block's not-archived branch, so
going from Valdivia to Tōhoku meant pressing "back to live", waiting for the live feeds to seed, reopening
the disclosure and picking again - clumsy for the one thing the list exists to make easy. Lifted out of the
branch: it renders in both states, `loadArchive` replaces a loaded day as readily as it loads the first, and
the disclosure stays open across the load so a hop is one click. Verified 1960 to 2011 directly.

Once it persisted, it needed to say **where you are**. The row for the day on screen takes `bg-raised` the
way a hazard row marks the selected mark, and `aria-current` so the tint is not carrying it alone. Asserted
in all three states: nothing marked while live, exactly one marked on a day, nothing again after "back to
live".

**The other finding was mine.** I measured the twelve new rows at 375px and got twelve under 44px, which
reads as a touch-target breach. It is not: the rule is scoped to `pointer: coarse` deliberately - a mouse is
precise and 44px rows on a desktop rail are chunky for no benefit - and Playwright's default pointer is fine.
In a real coarse-pointer context every row is **exactly 44px**, because that rule names `button` rather than
listing the regions that happened to have buttons when it was written. Its own comment says why: "naming
regions instead of naming the thing is how a rule stops covering what it was written for." Twelve rows added
months later inherited it without anyone touching the CSS, which is that decision paying out.

Worth noting the shipped touch test could not have caught a real breach here either, and for a defensible
reason: it skips zero-height boxes, and the disclosure is closed by default. A test that opened every
disclosure first would be a different test; this one is measuring the default view, which is the right thing
for it to measure.

## The credit, and the one rule it had to obey

"made by aiden jang" at the foot of the rail, linking to aidenjang.com, in the wording and lowercase the
other apps here use - `mrrp` renders the same string and `auth` keeps the canonical URL.

**An unstyled `a` would have failed this app's own test.** The user-agent link colour is a saturated blue,
and chrome here is held under a chroma ceiling of 55 with `design.spec.ts` enforcing it on every painted
element outside the canvas. So the link borrows `faint` and an underline rather than inheriting anything:
measured at **chroma 53**, underlined, opening in a new tab. The same trap `::selection` and the scrollbars
were caught by, which is why that test exists.

Last in the rail, below the event list, so it is a footer rather than a claim on the reading order. It sits
below the fold on a tall rail and the reachability rule covers that case by design: a control inside a
scroller whose own box is on screen is reachable.

**And the finger test caught it, which is the part worth writing down.** The coarse-pointer rule sets
`min-height: 44px` on `a[href]`, and **`min-height` has no effect on a non-replaced inline element** - so it
slid straight off an inline `a` and the link measured **14px** on a phone. The CSS looked like it covered the
case and could not. `inline-flex` makes the box one the property can reach: 16px under a mouse, exactly 44px
under a finger, verified in both contexts.

Two rules earned their keep on one four-word link. The chroma ceiling stopped it shipping in user-agent blue,
and the touch minimum stopped it shipping as a 14px target - and the second was a fault no reading of the
stylesheet would have found, because the rule naming `a[href]` was already there.

## The graticule was never behind the land

Reported from the app: orbiting north leaves part of Russia looking unfilled, with bare lines through it.
Correct, and the cause is not the fill.

**The mesh is fine.** A point-in-triangle test over the fill's own `aLonLat` covers central Siberia, Yakutia,
Chukotka and Taymyr, and reading pixels in a polar view gives 25,50,79 over Siberia against 3,17,32 over the
Arctic Ocean. Land renders as land.

What crosses it is the **graticule**, which DESIGN.md says is "deliberately left behind the land it sits
under: it is scaffolding". It was not. It sits at radius 1.003, outside the ocean shell, so its near half
passes the depth test - and the land fill writes **no depth at all**, which is a deliberate decision argued
in place: triangulation sag reaches 0.037 radii, so a lifted shell cannot be sized reliably, and turning the
depth test off removes the question. Nothing could occlude the graticule, so it drew over the continents.

Invisible at the equator, where a 38% line over land is a whisper. Glaring from a polar orbit, where two
dozen meridians converge into a starburst across Siberia.

**`renderOrder` alone could not fix it**, and this file already had the answer one layer up: three.js draws
every opaque object before any transparent one, so a transparent graticule paints after the fill however low
its order - exactly why the map backdrop is opaque. So the graticule fades by **colour** now instead of
alpha, pre-blended at its old 38% against the ocean it is henceforth only ever seen over, computed from the
palette rather than written down so the two ramps cannot drift. Its far half is still occluded by the
ocean's depth, because a line has no facing to cull.

A scan along the 66th parallel across Siberia now returns fourteen values all within two units of each
other - a day-wash gradient, not stripes. Verified on both projections: over open ocean the brightest pixel
in a window around each meridian sits **25 above the row median on the globe and 22 on the map**, and on a
meridian crossing a continent the on-line and off-line readings differ by **3 out of about 150**, which is
the fill winning.

**A dual treatment was built and then deleted, and the reason is the instrument.** Sampling one rounded
pixel per meridian said the map had lost its graticule entirely - twice, including once after the map's
original settings had been restored exactly, which should have been the tell. A meridian on the flat map is a
**one-pixel vertical line**, and a single rounded sample misses it; on the globe the same line is curved and
wider in screen space, so it was found there. Taking the brightest pixel in a window instead found it on both
at once.

By then the graticule had grown a per-projection treatment - opaque and early on the globe, transparent and
late on the map - to work around a problem that did not exist. Measured properly, the single treatment gives
the map a lift of 22 against the dual version's 23. So the machinery is gone: one arrangement, both
projections, and the simpler code is also the one the evidence supports.

**And the probe was wrong first, for the ninth time.** The coverage test walked `lonLat` in threes and
reported the Sahara, Australia, Amazonia and Greenland uncovered. The fill is an **indexed** geometry -
subdivision shares midpoints between neighbours, so three consecutive vertices are not a triangle. Its own
comment says so. Read through `index`, all eleven points pass.

## Hovering a shape with a shape

The mark hover drew a circle, grown to 34px so it would enclose a glyph. That was the wrong answer to the
right observation: a ring round a spiral reads as part of the drawing, and it argues with the rule the whole
layer is built on - marks are told apart by **shape**, so the thing that says "this one" should speak the
same language.

The hovered glyph is now redrawn in ink over itself, from the same tessellation the dim one uses, so the
highlight traces exactly the path of the mark rather than an approximation of it. Its own buffers and object,
because the marks share one geometry and one colour: brightening one glyph inside that soup would need a
per-vertex attribute and a shader to read it, for one line of feedback. Highlighting by `kind:id` means a
flood's three wave strokes light up together, which is what a flood is.

**Earthquakes keep the ring**, and that is the distinction rather than an exception: a dot has no shape to
brighten, so for a marker the ring *is* the highlight - the thing that says which dot among two hundred.
Verified both ways: ring opacity 0 on a glyph, 1 on an epicentre.

Checked afterwards on the states the change could have broken, since it added a second object to the scene.
It works on the flat map as well as the globe - the brightest pixel around a hovered spiral goes from 334 to
430 on the globe and 353 to 430 on the map - and across every visible mark the gain is 96, 117 and 133.

Every one of them peaks at the same 430, which is the point: the highlight is an opaque constant, so the
day-night wash cannot eat it, and the **gain is largest where the surroundings are dimmest**. A fire in the
dark gains more than a cyclone in daylight. That is the opposite of the failure I went looking for, which was
the wash washing the highlight out.

## The depth encoding was right and the sample was hopeless

Markers moved from a single shell just above the surface to their own hypocentre, which is where the
earthquake was. Two couplings made that harder than it sounds, and both are the kind that fail quietly.

`events.ts` turns the **depth test off on purpose**: a point sprite is a screen-aligned square carrying the
single depth of its centre, so near the limb half of every dot fails against an ocean surface much nearer the
camera and the survivors end at a straight edge through the middle. The far hemisphere is culled by a facing
discard in the fragment instead. That decision is what made true-depth marks possible at all - the planet
never had to occlude them - and reopening it would have brought the limb slicing back.

On the plane, **radius is the layer index**: `fmProject` builds its z from `length(sphere) - 1.0`, so a
marker shrunk to 0.89 would be filed a tenth of a world unit under the map and drawn behind the ocean. The
offset is therefore added to the projected point rather than baked into the radius, and it carries
`1.0 - uMorph` so it lifts back to the surface as the map unwraps.

Then the measurement that mattered. A real USGS day is **237 events, 14 of them between 70 and 300km, and
exactly two below 300**. A subducted plate is a sheet a hundred kilometres thick reaching seven hundred
down, and two points do not describe a sheet. The geometry was correct and the sample could never draw it,
so the pitch - orbit the Kurils and the scatter becomes a dipping plane - was not going to happen on live
data at any zoom.

The shape comes from the catalogue instead: **1,583 events at M4.5 and deeper than 300km over five years,
1,048 of them in the Tonga-Fiji corner**, committed as 37kB of numbers by `tools/make-slab.mjs`. Below 300km
nothing but a descending plate makes earthquakes, so every point is on one. It is drawn as geography rather
than as data - one dim tone, one fixed size, no ramp - because these are not today's readings and the one
thing the layer must never look like is the marks beside it.

### The chunking trap, walked into with the warning already written

`vite.config.ts` sweeps everything under `/src/geo/` into the `land` chunk, and **assigning a module to a
manual chunk overrides dynamic-import splitting**. `slab.json` went straight into `land`, which is
modulepreloaded, so 37kB behind an off-by-default toggle was fetched on every first visit - while the
module's own comment claimed it was a chunk nobody paid for until they asked. The config already carried a
note about this happening to `plateMotion.json`. Excluding it by name moved `land` from 142.91 kB to
**104.70 kB** and gave the table its own 11.99 kB gzipped chunk.

## Bloom was refused on a precedent already in this file

The ramp runs to near-white at the top and renders flat, so a glow pass looked like the obvious way to make
magnitude read as emitted energy. The entry above on additive blending is the argument against it: a dense
margin summed past the top of the ramp and **clipped to pure white, which is Instrument, the chrome colour**,
so the data was drawing the interface's own colour exactly where the data was most interesting. Bloom
spreads mark colour into neighbouring pixels, which recreates that on any dense cluster. It is a gamut
problem rather than a tuning one, and no intensity setting fixes it - it only moves the density at which it
breaks.

Three other canvas effects were built and cut for a simpler reason: they could not be demonstrated. A sun at
true angular size (0.533 degrees, about fifteen pixels) renders correctly and is **occluded at every camera
offset that also keeps it in frame**, because the visible window is a thin annulus between the planet's
angular radius and the frame's half-angle. A Milky Way band changed **700 of 1.15 million pixels**, then
1,689 after re-gating - at or below the noise between two runs of the same build. Star size variation lands
under the pixel grid. What survived - stars, a sun-aware limb, ocean glint, limb darkening - each moved
between 1.3% and 3.5% of the frame in an A/B against its own disabled build.

## The tour was narrating the wrong hemisphere

The rail's line is the tour's whole licence to move the camera: section 13 bans motion that means nothing,
and the line answers it by saying where the camera is and how much is there. It was not doing that. The
label and the flight were set from the same `tourAt` on the same tick, so for the first **45%** of every stop
the rail named the destination while the globe still showed the last one. Sampled mid-tour, it read
**"Japan & Kurils · 685 events" at longitude -82.8**, which is Chile.

Narration now waits for arrival, detected geometrically rather than on a timer, because the flight is a
spring and its duration depends on how far it went. Four degrees of tolerance: a spring approaches
asymptotically and a tight threshold leaves the line permanently unspoken. It works through a ref and a
stable setter, since `Globe` captures `onCamera` once when it builds the scene - the same reason the camera
itself was already written to a ref rather than to state.

**Nothing caught this because nothing tested the tour.** Seven surfaces had no browser coverage at all -
Tour, Sound, Copy link, Far side, Fly here, Announce, and cinema mode. They have guards now, and each guard
was mutation-tested: reverting this fix fails with `narrated "Alaska & Aleutians" while the camera was at
126.5`, 78 degrees out.

### The guard's first version measured the wrong thing

It sampled `location.hash`, which is written on a throttle and trails the live camera far enough to cross 37
degrees mid-flight, so it paired a fresh label with a stale position and failed on a stop that was correct.
The lazy repair was to widen the tolerance past 37 and call the test flaky. Reading the camera the label is
actually gated on allowed it to be **tightened from 30 degrees to 10**.

## An archived day was told about its own future

The region-record table is a maximum over 2000 to 2025 and knows nothing about which day is on screen. Load
the archived day 2001-06-23 and the rail read **"Largest in Indonesia since 2000: M9.1, December 2004"** - an
earthquake offered as context for a day three years before it happened.

The comparison takes the displayed day as its now: `snapshot.archive.from` for an archived day, the clock
otherwise, and silence when the record postdates it. Citing the whole-span record whenever it *predates* the
day is still correct rather than a fudge - the record is the maximum over the full span, so if it fell before
the day on screen then nothing between 2000 and that day was larger either.

## Open, and honestly so

Written last, and kept accurate rather than kept short.

- **Aftershocks can still be swallowed, but only the close ones now.** Association used time and
  distance, and in those two dimensions the populations genuinely do overlap - real matched pairs reach
  16.7 seconds and 135km, squarely inside aftershock territory. **Magnitude is a third axis and it does
  separate them**, which this entry had not tested: 97 measured cross-agency pairs disagree by at most
  0.40, so a one-unit window costs nothing, while most aftershocks sit further than that below their
  mainshock. What remains is a doublet within one magnitude unit, which needs waveform data no keyless
  feed carries. The detail panel still lists every merged reading, so a wrong merge stays visible.

- ~~**Browser tests still run against a dev server, not a build.**~~ **Closed on 2026-08-21**, though the
  capability is what closed rather than every test having been run that way. `EIF_BUILD=1 pnpm test:e2e`
  (or `pnpm test:e2e:build`) builds and serves `dist` instead of booting `pnpm dev`. Twenty-six cases have
  been run against it - the whole design suite plus three interaction cases - and all passed. **The full
  suite has since been run that way: 55 passed, 7 skipped.** This sentence used to end "the full
  interaction suite against a build has not been run yet", which stopped being true and stayed here
  anyway - the same fault the bullet below is kept to remember.

  Opt-in rather than default because a build is slower than a dev boot and this is already the slow gate.
  `reuseExistingServer` is **off** in build mode deliberately: with it on, a dev server left on the port
  gets silently reused and the run tests dev while reporting that it tested the build, which is worse than
  not running it at all.

  **Seven tests cannot run against a build, and now say so.** They read `window.__globe` and
  `window.__feed`, which `Globe.tsx` exposes only under `import.meta.env.DEV` - correctly, since a
  production bundle should not carry a debug surface. Against `dist` they failed with
  `Cannot read properties of undefined (reading 'store')`, which reads like a bug and is a contract.
  `needsDevHooks()` skips them in build mode, so the summary reads **55 passed, 7 skipped** rather than
  green-with-a-hole or red-for-the-wrong-reason. Full suite in dev: **62 passed**.

- ~~**Both gates are sensitive to a loaded machine, and neither says so when it fails.**~~ **Closed on
  2026-08-21, and it had been half-closed for a while without this entry noticing.** The perf side took
  its own advice: `events.perf.test.ts` measures a reference workload in the same process and budgets a
  *ratio* against it, so `13.96ms` on a busy laptop and `7.65ms` on a quiet one both read as the same
  number of reference units. The browser side got the fixtures it asked for, and then the last of the
  load sensitivity turned out to be the polls rather than the feeds: every camera assertion waited a
  fixed number of seconds for the spring to arrive, so a slow machine was indistinguishable from a
  broken one. Those now wait for motion to *stop* and then assert where it stopped, and four blind
  timeouts went with them. The full suite: **60 passed, nothing flaky, and three minutes faster.**

  Kept rather than deleted, because the shape of the mistake is worth remembering: this bullet was
  correct when written, both halves were fixed by later work, and nothing brought the two together. A
  known-limitations list is the section a reader trusts most, which makes a stale entry in it worse than
  no entry at all.

  **And "closed" was too strong, which this bullet then repeated about itself.** One later run reported
  five interaction failures in **41.9 minutes** against 5.8 for the same suite an hour earlier, all five
  passing in isolation and 39 of 39 on a re-run; the heap gate failed once and passed 747 of 747
  immediately after. So the camera assertions were fixed and the sensitivity was not eliminated: what is
  actually closed is the *diagnosis*, because an elevated runtime is the tell - though not 7x, which was one
  observation mistaken for a threshold: a **2.2x** run on 2026-08-24 failed two cases that passed in isolation. The heap gate still budgets an
  absolute 5MB of drift, which is the shape the CPU gate abandoned when a millisecond threshold failed
  three times on unchanged code, and its own fix - a ratio against a reference workload in the same
  process - has not been applied here.

  **Rewritten on 2026-08-24, and the fix this entry prescribed was the wrong one.** Measured first: the
  heap number is 1.40MB on fourteen consecutive runs, alone and inside the full suite, varying by under
  0.01. It is not load-sensitive, because retained bytes do not scale with contention the way milliseconds
  do - so a same-process reference would have divided a stable measurement by a noisier one and called the
  result robustness. Note also that `test:heap` is the script that runs **all 769 tests**, so "the heap gate
  failed once" never implied this assertion was what failed.

  What was actually wrong was the precondition. "Warm up past capacity first" pushed thirty minutes, which
  is 450 readings into 2,000 slots, so the 1.41MB being budgeted was mostly the ring filling for the first
  time. Fill it properly - now asserted with `store.size() === store.capacity` rather than described in a
  comment - and twelve further hours cost **0.044 to 0.085MB**. The budget is 0.5MB over 16,151 ingests,
  about 32 bytes of retention each against the old 325, and it was checked by making it fail: retaining one
  small object per ingest costs 149 bytes each and 2.302MB, which this catches and 5MB did not.

  **Corrected again on 2026-08-26: the ratio normalises load, and does not normalise machines.** This
  entry has said since it was closed that "13.96ms on a busy laptop and 7.65ms on a quiet one both read as
  the same number of reference units", and that is true of two runs on *one* machine. Between machines it
  is not. A second machine reported **22.85 reference units on the `findNearby` budget of 22** and went
  over the `sync` budget on the same run, on code neither machine had touched; three runs here at load
  average 11 read **4.4 to 5.4 against a budget of 7** for the same `sync`, and 14.7 to 15.8 for the same
  `findNearby`. That is a 50% gap in the supposedly machine-independent number.

  The mechanism is that the reference is not shaped like the target after all. It writes one typed array
  and is bound by arithmetic on a single stream; `sync` walks five typed arrays and a Map and is bound by
  memory and cache. Two different bottlenecks do not scale together across CPUs, so dividing one by the
  other cancels contention within a machine and nothing at all between them. The comment in
  `events.perf.test.ts` claimed contention "hits both the same way" and now says what it can support.

  So the budgets are a regression alarm calibrated to one machine, not absolute figures, and a failure on
  a different machine is worth reproducing before it is worth believing. Fixing it properly means a
  reference workload bound by the same resource as the target, which cannot be validated from a single
  machine and so has not been attempted. That is the third correction to this bullet, which is the
  argument for keeping it rather than the argument against.

- ~~**GPU frame time has never been measured with a profiler.**~~ **Measured on 2026-08-21**, and the
  answer is comfortable at 60Hz and not especially comfortable at 120Hz. On an M1 Pro through
  ANGLE/Metal at **2560x1440** (device pixel ratio 2), with 95 events in the window, a full scene draw
  costs a **median of 2.0 to 5.1ms and a maximum of 6.4ms** across passes. Against a 60fps budget of
  16.7ms that is a quarter to a third; against a 120fps budget of **8.3ms the maximum is 77%**, which is
  the number worth keeping in view.

  **Conditions, because they matter more than the figure.** One machine, one resolution, one event count,
  and drawn back-to-back by `__drawOnce` rather than once per vsync - so the GPU pipelines differently
  than it would in a real frame loop, and these are a lower bound on a busy frame rather than a
  simulation of one. Still measured rather than asserted, which is what this entry was complaining about.
  Not gated: a threshold on a single machine's timings would be a budget that only means something here.

- ~~**The window cannot go back before the page opened.**~~ **Built on 2026-08-21, and the reason given
  here was wrong.** It was attributed to having no backend; both agencies expose FDSN event endpoints that
  take an arbitrary `starttime` and `endtime`, keylessly, CORS-open. The blocker was never the backend, it
  was that nobody had asked them for anything but the last day. What this note was *right* about is the
  shape: a scrubber that quietly makes "this is happening right now" false is the version worth refusing.
  So it is a mode, not a slider - see below.

- ~~**Dense sequences are readable now, and still not steppable.**~~ **Closed on 2026-08-21.** The strip
  could draw three hundred neighbours in time order and there was no way to visit one, because the
  offsets carried *when* each happened and nothing said *which event* it was. `sequence` now carries the
  key - one field on a list `findNearby` already builds and sorts - and the panel has two steps to the
  events immediately before and after this one. The largest-neighbour rows became buttons in the same
  pass: they had named the four events most worth looking at and left you to find them in a rail of sixty.

- ~~**Holding an hour is pointer-only.**~~ **Closed on 2026-08-21.** The bars are real buttons now, so
  focus is the hold: one tab stop for the strip on a roving `tabIndex`, arrows walk the day, Escape lets
  go, and a tap does what a tap looks like it should do. This entry rejected the obvious fix - "no amount
  of arrow-key cleverness would be discoverable enough to count" - and it was right about cleverness. A
  focusable group is not cleverness, it is the pattern: the focus ring shows where the hold is, and the
  readout beside the strip already said what was held. `STRIP_PX` was already 44, exactly the touch-target
  minimum, so it cost no layout. `aria-label` reuses the readout's own words, and an hour the buffer never
  covered says "Not covered" rather than reading as a quiet hour.

- ~~**"just now" on an archived day.**~~ **Closed, and the reason it stayed open twice was an arithmetic
  mistake.** It was deferred as "0.05% of a day", which is 45 seconds as a fraction of 86,400 - the wrong
  quantity. The row that gets read is the **newest** one, at the top of the rail, and the gap between a
  day's end and its newest event is exponential: at 200 events a day the top row reads "just now"
  **9.9%** of the time and at 400 events **18.8%**. Two orders of magnitude from the number that justified
  leaving it. It reads "at the day's end" now, and "end" in the short form, matching the words the activity
  strip and the transport already use for that edge.

- **The cross-section's swatches are close, not exact, on the default ramp.** They are painted from
  `--color-coast` and `--color-plate`, which chrome cannot set to the blue canvas values - chroma 70 and 78
  against a ceiling of 55. Measured at **dE 6.5**, and **0.0** on the colourblind ramp, where the canvas
  uses those same neutral values. 6.5 is the floor the rule allows, not a slip.

- ~~**EONET is not stubbed in the browser harness.**~~ **Closed, and the entry was wrong about the
  scale.** It named EONET as "the only outbound host a stubbed run still reaches", which was measured with
  a spy patterned on the three hosts I expected. Patterning it on *everything* external found **14 requests
  to gdacs.org and 2 to services.swpc.noaa.gov on a single test** - roughly a thousand GDACS calls per
  suite run - for data **no test asserts on**: a grep for the layer sentences across both specs returns
  nothing. All four hazard hosts are stubbed now and a spy sees nothing leave.

- **The ratio cancels a busy machine and not an oversubscribed one, and the entry above overstated it.**
  That bullet closed the perf gate's load sensitivity on the strength of measuring a *ratio* rather than
  a duration, and the ratio does hold across ordinary busyness. It does not hold across heavy
  oversubscription. Measured on this ten-core machine across one day: **5.61, 5.72, 5.80** reference units
  at a load average under 10, against **6.43, 6.76, 6.89, 7.19** at a load average near 100 - the same
  build, the same commit, straddling a budget of 7 on the second set and nowhere near it on the first.
  Scheduling noise stops being symmetric once the reference workload is itself being preempted.

  Recorded because of what it invites. The failure looks exactly like a regression in
  `events.sync`, and the cheap repair is to raise the budget - which would spend the whole margin on a
  machine condition rather than on code. The check that settles it is cheap: the number returns to 5.7 when
  the machine is quiet, so a budget-raising commit should always have a low-load measurement beside it.

- **Both browser suites are load-sensitive in a way that reads as breakage.** Same day, same commit:
  design **27/27 in 3.1 minutes** at a load average of 4 to 16, and **23/27 in 7.5 minutes** at 71.
  Interaction **45/45 in 7.8 minutes** at 12, and **9 passed in 18.1 minutes** at 71. Every failure in the
  loaded runs passed in isolation. The camera assertions already wait for motion to stop rather than for a
  fixed number of seconds, which is what the entry above fixed; what remains is that a page which takes 39
  seconds to reach first data cannot finish a 45-second test whatever it is waiting on. There is no repair
  here to make in the app - the note exists so a loaded run is read as a loaded run.

- **No demo video.** The write-up asks for one and there is none, because recording it was not
  something this build could do.

### The cross-section draws the slab, and the empty state had to learn that

`buildSection` takes the slab table as an argument and projects it into the same corridor as the events,
so the deep record appears as a second, dimmer layer under them. This is where item 11's depth encoding
actually pays off: on the globe the sink is a parallax that only reads obliquely and gets hidden by the
limb and the facing test, while a section is a depth plot with nowhere for the shape to hide. A corridor
across Tonga draws the slab dipping from 300km to a 600km cluster, which is the picture the globe can
only gesture at.

Two things had to move to make it reachable.

The **slab toggle was hidden on the flat map**, on the correct grounds that a plane has no inside and the
globe layer collapses there. Sections only exist on the flat map, so the control was unavailable in the
one place the data had just become useful. It is now offered on the map when a section is open and hidden
otherwise, which keeps the original point: the control appears exactly where it changes something.

The **empty state counted the wrong thing**. It asked whether this window's events were empty and printed
"nothing inside this corridor", which was the same question as "is there a picture" right up until the
slab arrived. A Tonga corridor with 548 slab points and no recent events rendered the empty state and no
plot at all. The gate is now `points.length + slab.length`, and the case where those differ gets a
sentence of its own: a dense arc with nothing from the window in it is the one drawing here that can lie
by looking busy, and every other drawing in this app is about the window on screen.

The panel also went from `bg-deck/40 backdrop-saturate-50` to `bg-deck/70 backdrop-saturate-0`. Half
saturation was fine behind type and not behind 1.6px dots at a quarter opacity: the map's own cluster came
through as a magenta glow and won. Hue is banned in the interface anyway, so zero rather than half.

### `aDepth` was `aSink` written twice

The events layer carried two per-event float attributes derived from the same `depthKm`: `aSink`
(depth over the planet's radius, for the sink offset) and `aDepth` (depth normalised against
`DEPTH_DEEP_KM`, for the hollow centre). `aDepth` is now computed from `aSink` in the vertex shader, so
`sync` writes one array instead of two and uploads one 50k-float attribute instead of two.

The derivation only runs this way round, which is why the redundancy survived: `aDepth` saturates at
300km and cannot produce a sink that reaches 700, so the comment on `sinkFraction` correctly rejected
going the other way. It never asked the reverse question.

Measured on `sync` at 50,000 events, median of three: **5.36 ref before, 4.44 after**, against a budget
of 7. Removing only the sink write scored 4.94, so this is faster than before the depth sink existed.

It also settled a disagreement. A finite depth greater than the planet's radius is not a reading;
`sinkFraction` called it shallow and refused to offset the mark, while the old normalisation clamped it to
1 and drew it hollow. One source now gives one answer, and `sink.test.ts` pins the equivalence for every
real depth plus that one deliberate difference.

**Pixel comparison could not verify this.** Two screenshots of identical code at the same permalink hash
differently, so a before/after image diff proves nothing about the render. The algebra is covered by unit
test and the render by eye.

### The sky is a skybox with no per-frame work

`starfield.ts` draws the catalogue as one `Points` object whose vertex shader adds `cameraPosition` to
each star's unit direction. Stars therefore sit at a fixed distance from wherever the eye is, so orbiting
sweeps them and travelling never slides them, and nothing in the render loop has to know the layer exists.
The alternative - copying the camera position onto the object every frame - needs a hook in a loop that is
deliberately asleep whenever nothing moves.

Two things bit on the way:

- **Three.js frustum-culls `Points` against a bounding sphere derived from the buffer.** The positions are
  unit vectors about the origin while the shader draws them sixty units out around a moving camera, so the
  whole layer vanished the moment the camera left the unit sphere, which is immediately.
  `geometry.boundingSphere = null` and `frustumCulled = false`, because the geometry is not where the
  drawing is.
- **The brightness curves were the wrong way round.** Both gammas started above 1, which is right for a
  flat distribution and wrong for this one: 4,176 of 5,080 stars are fainter than magnitude 4.5, so the
  typical normalised brightness is about 0.07 and a gamma above 1 crushed nearly the whole catalogue onto
  the minimum size. Measured as 16 lit pixels in a patch of sky where the old field had 164, with the star
  count in that patch already about right. Gammas below 1 lift the same 0.07 to 0.31.

**The star count in that patch was right all along, and the first diagnosis said otherwise.** The initial
read was "too few stars" and the fix would have been a bigger catalogue; working out the camera's actual
field of view gave about 14 catalogue stars in the patch against the old field's 19. The stars were all
there and all drawn a pixel and a half wide.

**Pixel comparison cannot verify any of this.** Two screenshots of identical code at the same permalink
differ, so both a before/after image diff and a same-day/same-sky check come back false for reasons that
have nothing to do with the sky. Lit-pixel *counts* are stable and were used instead; positions were not.

**The sun and the sky are both aimed from `Date.now()`.** `scene.render` throttles `aimSun` to the minute
and hands it wall-clock time, so an archived day is drawn under tonight's terminator - true before the sky
existed and now true of the sky too. Both should follow the moment on screen. What stops it being a
one-line change is that a whole archived day has no single instant, and the app has not decided which one
it means.

### The moon costs one formula because the sky went in first

`geo/moon.ts` is the abridged lunar series - the largest handful of terms out of hundreds - reported the
same way `sun.ts` reports the sun: as the point on Earth the body stands over. It reuses `gmstDeg` to turn
a right ascension into a longitude, which it has to, since a moon placed by a different convention than
the sky behind it would drift through the constellations it is supposed to be crossing.

Accuracy is about a tenth of a degree, or a fifth of a moon's width. Stated rather than implied, because
it is far too coarse to predict an eclipse with and far finer than an eleven-pixel disc can show.

**Tested against eclipses, which is the only honest way to test an ephemeris without shipping a second
one.** An eclipse is a published fact about the sun and the moon coinciding, or opposing, at a stated
minute, and it exercises the position, the frame and the epoch at once - with `sun.ts` as the independent
half, sharing no code beyond the definition of a Julian century. The April 2024 total solar eclipse comes
out under a degree of separation and the September 2025 lunar eclipse over 179.

**The synodic month test failed on a correct answer.** A year of new moons averaged 29.42 days against the
true 29.530588, because the real spacing swings a quarter of a day either side and twelve intervals do not
converge. Five years do. Loosening the tolerance would have hidden the quantity being measured.

**The moon forced the stars further out.** `STAR_DISTANCE` was 60, and the moon reaches 64 radii from the
origin and so 68 from the eye, which put stars in front of it. Now 80, still inside the far plane of 100.

**It is transparent and writes depth.** It has to draw after the stars so it can cover them, and it has to
fade with the morph to the flat map, and those two together rule out the opaque pass. Writing depth keeps
it solid anyway: a star behind it is already on screen by then and gets painted over, while the planet is
opaque and wrote depth before any of this, so a moon behind the Earth is correctly hidden.

**Finding it on screen took four attempts, and none of the failures were the moon's.** `controls.project`
returns null for anything behind the horizon and asks that question at the surface even when handed a
radius - correct for event markers, useless for something sixty radii out. A blob detector then found the
sunlit limb of the Earth instead, being brighter than a moon. What worked was arithmetic: at a 32 degree
vertical field of view over 900px, 28.1px per degree puts a 13 degree offset at y=85, and there it was.
