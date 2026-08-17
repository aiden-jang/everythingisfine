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

## Open, and honestly so

- **Reduced motion is written but not observed.** The code path skips momentum and snaps the reset,
  but it has not been run under an actual `prefers-reduced-motion: reduce` setting. Playwright can
  emulate it and that belongs in step B rather than being claimed now.
- **GPU frame time has never been measured**, because until step 7 there is nothing on the globe
  whose cost would mean anything.
