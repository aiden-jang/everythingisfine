# Design System: First Motion

A live global event visualization. A WebGL globe with real events streaming onto it as they happen.

This file is the single source of truth for generating screens. Where it disagrees with a general
design default, this file wins, and the reason is written down.

**Budget: $0.** Not "cheap". Zero. No paid data source, no paid tier, no key that costs money, no
service that starts free and bills at scale. Section 2 is where that constraint lives, and it is
load-bearing: several of the best decisions in this document exist because of it.

---

## 1. Visual Theme & Atmosphere

A dark observation deck. Quiet, instrument-like, and almost entirely still except where data is
moving. The feeling to aim for is a monitoring room at night: the room is dim so the screen can be
bright, and nothing on the walls competes with what is on the screen.

**Density: 6 of 10.** A stats rail and a detail panel carry real numbers, so the chrome is compact
and information-dense. The globe gets air. Density is spent on the panels, not on the canvas.

**Variance: 4 of 10.** Deliberately low. This is an instrument, not a poster. The layout is a stable
frame around a moving subject, and a frame that draws attention to its own composition is a worse
frame. Asymmetry comes from the globe sitting off-centre against the rail, not from restless blocks.

**Chrome motion: 3 of 10. Data motion: 8 of 10.** Two separate axes. Conflating them is the single
easiest way to ruin this product.

---

## 2. The Zero-Cost Constraint

### 2.1 What it forbids

No API key that costs money, and no key that a person cloning this repo would have to go and get.
That second half is stricter than the budget requires, and it is the one that shapes the design: a
project that cannot render its own first frame without a signup has no first thirty seconds.

This rules out the obvious second source. OpenSky moved to OAuth2 client credentials, and while
registration is free, it is still a secret in an env file. AIS providers all want a key. Both would
mean either shipping a proxy with a stored secret, or shipping a repo whose first frame is empty.

### 2.2 What it forces, and why the forced answer is better

**Two sources, both keyless, both real, and both earthquakes.**

- **USGS** GeoJSON, polled over HTTPS, permissive CORS, no key.
- **EMSC seismicportal**, a public WebSocket standing order, pushed, no key.

One polling and one push, which is what the scope demands, at zero cost and zero configuration.

The interesting part is that they report **the same physical events**. The same earthquake arrives
twice, minutes apart, under two different identifiers, with magnitudes on different scales that
disagree by a couple of tenths, and with epicentres that differ by kilometres. Two unrelated feeds
would have proved the adapter interface. Two overlapping feeds prove the adapter interface *and*
force real normalisation, real identity resolution, and a real reconciliation policy.

That is a harder problem, it is testable as pure logic, and it is a far better write-up than "I
plugged in two APIs". The constraint produced the better engineering story, which is worth saying
out loud rather than presenting the result as if it had been the plan all along.

**Reconciliation is visible in the interface, not buried.** When two sources describe one event, the
detail panel shows both readings and which one the marker is drawn from. Silently picking a winner
would throw away the most interesting thing on the screen.

### 2.3 The rest of the zero

- **No backend, hosted on Cloudflare like the other apps.** A `wrangler.toml` with **no `main`**,
  matching IDLE. With no Worker script, asset requests are answered without invoking a Worker at
  all, so the running cost is zero invocations rather than a small number of them. `workers_dev`
  off, one custom domain, `not_found_handling = "single-page-application"`.
- **Both feeds are reached straight from the browser, verified rather than assumed.** USGS returns
  `access-control-allow-origin: *`. The EMSC endpoint returns `101 Switching Protocols`, and
  WebSocket is exempt from CORS by construction, so it needs no header at all. No proxy Worker,
  which is what keeps the no-`main` deployment possible.
- **No photographic globe texture.** See section 4. This is a design win, not a compromise.
- **Fonts self-hosted from the package**, not linked from a font CDN.
- **Persistence is IndexedDB and the URL fragment.** Nothing leaves the device.

---

## 3. The Two-Palette Rule

The most important rule in the document. Everything else bends around it.

**First Motion has two colour systems that must never touch.** One belongs to the data. One belongs to
the interface. If a viewer cannot tell at a glance whether a colour is telling them something or
just decorating a button, the visualization has lost the thing it exists to do.

### 3.1 Interface chrome, achromatic, always

The chrome carries **no hue at all.** Not a blue accent, not a cyan one. Hue is the data's alphabet
here, and lending one letter of it to a toggle makes every other use of that letter ambiguous.

This is stricter than the usual "pick one accent", and it is not a stylistic preference. The default
magnitude ramp is warm and the colourblind-safe ramp runs blue to yellow. Between them they occupy
most of the wheel. Achromatic chrome is the only choice that survives both modes.

Active, selected and focused states are communicated by **brightness, weight and a 1px ring.**

| Token | Value | Role |
|---|---|---|
| Void | `#070B14` | Space behind the globe. Not pure black: the rim light needs somewhere to fall off into. |
| Sphere | `#0A101C` | The ocean face of the globe, a step above Void so the silhouette reads. |
| Landmass | `#151D2E` | Continent fill. Raised over Sphere, still clearly chrome. |
| Coastline | `#243149` | 1px land stroke and graticule. |
| Deck | `#0D1420` | Rail and panel background. |
| Deck Raised | `#141C2B` | Detail panel, popovers, anything above the rail. |
| Hairline | `rgba(148,163,184,0.14)` | Structural 1px dividers. Never a full-strength border. |
| Instrument | `#E8EDF5` | Primary text, live counters, the selected event's ring. |
| Instrument Dim | `#8A96AC` | Labels, metadata, secondary readouts. |
| Instrument Faint | `#55617A` | Disabled states, ticks, timestamps at rest. |

Focus ring: **Instrument at 2px with a 2px offset.** Roughly 11:1 against Deck, well past the 3:1
that non-text contrast requires, and unmistakable for any data value.

**The one named exception.** The atmospheric rim, `rgba(120,150,190,0.16)`, carries a trace of hue.
It is allowed because it sits on the silhouette where no marker is ever drawn, it never encodes a
value, and a sphere without it looks like a flat disc. Naming the exception is the point: an
unstated exception becomes a precedent, and the next one will be a blue button.

### 3.2 Data ramps, where hue lives

Two ramps ship. The viewer picks and the choice persists.

**Thermal**, the default, for magnitude:
`#3B2A63` → `#8A2F55` → `#C7452F` → `#E8791B` → `#F5C242`

**Cividis**, the same data, deuteranopia-safe by construction:
`#00224E` → `#35618F` → `#7D8E92` → `#B5A15B` → `#FEE838`

**One correction to an earlier claim in this document.** It used to say neither ramp contains a
neutral grey. Measured, that is false: Cividis's midpoint `#7D8E92` has a channel spread of 21,
which is *less* chromatic than `Instrument Dim` at 34 and than `Coastline` at 37. Cividis is
perceptually uniform for deuteranopia by construction, and a near-neutral midpoint is part of how it
achieves that, so this is not a stop that can be swapped out.

What actually keeps data and chrome apart in colourblind mode is therefore **position, not chroma**:
everything inside the canvas is data and everything outside it is chrome, with no element of either
kind crossing that boundary. That separation is worth more than the chroma claim was, because it
holds for every ramp anyone might add later. Thermal's least chromatic stop is 57, comfortably clear
of the chrome, so the original claim happens to hold there and is simply not load-bearing.

**Magnitude is encoded twice: radius and ramp position.** Colour alone fails a colourblind viewer,
and fails again when the globe is 300px wide on a phone. Radius scales with the square root of
magnitude so that area reads as intensity rather than width.

### 3.3 The signature is the wavefront, not an arc

The source doc says the arcs are the signature and everything else stays quiet so they land. That
was written assuming a source with an origin and a destination: flights, shipping, network traffic.
Two seismic feeds produce points. An arc drawn between two earthquakes would be a line asserting a
relationship that does not exist, which is the exact failure the two-palette rule exists to prevent,
one layer up.

**A seismic event's real signature is the wavefront.** On arrival, a ring expands outward from the
epicentre, fading as it goes, because that is physically what happened. Radius at the ramp colour,
1px stroke, opacity falling off with distance.

**The ring expands at the P-wave velocity, roughly 6 km/s through crust, played back at ×20.**
Not an arbitrary ease. The rate is derived, and the acceleration is printed in the rail rather than
hidden, which keeps it inside section 10 instead of breaking it.

The ×20 is not a shortcut, it is a measurement. 6 km/s over a 6371 km radius is 0.054 degrees per
second, which at a 400px globe is **0.16 pixels per second**. A mock built at true rate proved the
front is imperceptible, and an imperceptible wavefront fails section 8's requirement that the first
frame after load has a ring expanding. Real rate would have been honest and useless at the same
time. Stating the multiplier keeps both.

Projection: an angular distance θ from the epicentre projects to a screen radius of `R·sin(θ)`. Any
other scaling makes the ring a decoration that happens to start in the right place.

This is better than an arc, not a substitute for one. An arc says "something travelled between these
two points". The ring says "this happened here, and this is how far the energy has reached", which
is a true statement about data you already have. Arcs return only if a source with real origin and
destination is ever added, and every such source costs a key, so they are out of scope.

---

## 4. The Globe Itself

**Vector coastlines, not a satellite texture.** Natural Earth 110m, public domain, roughly 100KB
gzipped, drawn as filled geometry in Landmass with a Coastline stroke.

Three reasons, in order of importance:

1. **It keeps the earth inside the chrome palette.** A photographic Blue Marble texture puts green,
   ochre and white across the whole sphere, and every one of those competes with the data ramp. A
   viewer would be reading hue in two different languages at once. Vector land is chrome, so hue
   still belongs to events alone.
2. **It stays sharp at every zoom.** A raster texture large enough to hold up at maximum zoom is
   several megabytes; the vector is a tenth of that and never softens.
3. It costs nothing to serve.

Graticule at 15 degree intervals in Coastline at 40% alpha. Present enough to give the sphere
rotation something to read against, quiet enough to vanish once events are on it.

No specular ocean, no cloud layer, no night-lights overlay. Each is a texture that says something
the data does not.

---

## 5. Typography

- **Display and UI: Geist.** Chosen over Inter, which is the default-looking choice and reads as
  unconsidered. Weight-driven hierarchy, tracking tightened above 24px.
- **Numbers and coordinates: Geist Mono.** Timestamps, lat/long, event identifiers, magnitudes.
- **No serif anywhere.** This is an instrument.

**Every live number uses tabular figures** (`font-variant-numeric: tabular-nums`), including in the
proportional face, not only the mono one. A counter updating every second visibly jitters its own
width without them, and that jitter is the difference between a readout that looks solid and one
that looks twitchy.

Body copy caps at 65 characters. There is very little body copy here and there should be.

---

## 6. Components

**Buttons and toggles.** Flat, hairline border, Deck Raised fill. Active state is a brightness lift
plus a 1px inner ring, never a hue change. `translateY(1px)` on press. No glow, ever: a glow on a
dark canvas reads as data.

**The stats rail.** No cards. Rows separated by Hairline, numbers right-aligned and tabular. Cards
would add a dozen borders competing with the globe for edges. Clicking a region flies the camera.

**The detail panel.** The only element allowed a real elevation shadow, tinted to Void rather than
black, because it genuinely floats above the scene. Shows both source readings when an event was
reported twice.

**Filters respond as they move.** No apply button. Magnitude threshold, time window and source
toggles filter client-side, so the globe answers the slider continuously.

**Hover before click.** Points brighten and show a one-line tooltip. This is what makes the scene
read as an interface rather than a picture.

**A pinned selection survives every refresh.** Treated as a design rule rather than a bug, because
it is the most infuriating possible failure in a live visualization and the easiest to write by
accident.

**Loading.** The globe renders before data arrives, with a skeletal rail. Never a spinner over a
black screen: the first frame must already look like the product.

**Empty state.** "No events match these filters" plus a control that widens the window, in place, in
the rail. Never an empty globe with no explanation.

**Error state.** A failing source degrades to a hairline notice in the rail naming the source and
the retry. The globe keeps rendering what it has, and the other source keeps arriving. A dead feed
must never blank the scene.

---

## 7. Layout

Three zones: rail, canvas, detail panel. CSS Grid, never flexbox percentage maths.

- **1280px and up:** rail left (320px), canvas centre (`1fr`), detail panel right (360px) when an
  event is pinned. The globe sits slightly left of optical centre so a pinned panel does not shove
  it sideways.
- **768 to 1279px:** rail collapses to a top strip, detail panel becomes a right overlay.
- **Below 768px:** single column. Globe takes the top `60dvh`, rail becomes a scrollable sheet
  beneath, detail panel becomes a bottom sheet. **Not optional.** A passive watchable visualization
  gets most of its shared links opened on a phone.

`100dvh`, never `100vh`. Touch targets 44px minimum. Horizontal scroll at any width is a build
failure, not a bug.

---

## 8. Motion

**One entrance, then only data.** The globe rotates into its framing position once, the first events
populate, the camera stops. After that the only thing moving on screen is the data.

**No ambient rotation. No perpetual micro-loops on chrome.** This departs from the usual advice to
give every active component an infinite loop, and the reason is specific: this product's entire
claim is "this is happening right now". A pulsing chrome element is motion that means nothing, and
the moment a viewer sees motion that means nothing, all the other motion becomes suspect. Idle
chrome is what makes a moving arc read as real.

- Camera: orbit with damping and momentum, zoom toward the cursor rather than the screen centre,
  clamped so the globe cannot be entered or lost. Double-click returns to the framing shot.
- **North stays up.** The globe never rolls, which means a drag does not track exactly what it
  grabbed away from the equator: 0.2px of slip at the equator, 4.4px at the framing latitude, 53px
  at 70 degrees. Exact tracking needs rotation about an arbitrary axis, and a map whose north
  wanders is a worse instrument than one that slips a little up north.
- Wavefront rings: expansion rate is P-wave velocity, not a duration. See 3.3.
- Springs (`stiffness 100, damping 20`) for the camera, not for the data, which should feel physical
  rather than bouncy.
- New events scale up from zero over 240ms, staggered when a batch lands, never all at once.
- Transform and opacity only.

**The first frame after load has a ring expanding.** Stated as a requirement because it is the whole
value proposition compressed into one second, and it is easy to lose to a change in loading order.

The buffer is seeded from **the last day** of USGS on load, then polls the hourly feed. This
originally said "the last hour" and measurement killed it: the hourly feed held 8 earthquakes, of
which 4 cleared the default magnitude floor. Four dots is not a live visualization however genuinely
live it is. The daily feed holds 227 in 163kB, fills the globe on the first frame, and costs one
request rather than 163kB every minute forever.

**`prefers-reduced-motion` is honoured completely.** No entrance rotation, no arc travel, no camera
easing. Events appear and fade in place. A half-disabled motion setting is worse than none, because
it signals the setting was an afterthought.

---

## 9. Accessibility

A globe of moving dots is close to worst case, which is exactly why doing it properly is worth
doing. This is a feature, not a compliance checklist.

- The canvas is `aria-hidden`. Beside it, a visually hidden but fully navigable list of recent
  events carries the same information as text.
- **Tab reaches the event layer; arrow keys move between events ordered by recency**, not position.
  Spatial arrow-keying on a sphere is disorienting; recency is comprehensible. Enter opens detail,
  Escape closes and unpins.
- A polite live region announces events above a viewer-set threshold: "Magnitude 5.2 earthquake, 40
  kilometres east of Tokyo, two minutes ago." **Threshold, not everything.** A busy feed floods a
  screen reader and the viewer turns the whole thing off.
- Colourblind ramp toggle, persisted.

---

## 10. Honest Numbers

Every number on screen is either measured or labelled. This is a design rule because the failures
are all visual ones.

- **The time window states its own left edge.** With no backend, the buffer starts when the page
  loads, so "last 24 hours" is a lie for the first 24 hours. The rail reads "since 21:40" until the
  window genuinely fills, then switches. Getting this wrong is the difference between a demo and a
  claim.
- **A deduplicated count is labelled as one.** If USGS and EMSC both reported an event, the counter
  shows distinct events, and the source breakdown shows the raw counts underneath.
- **Magnitude carries its scale.** `M 5.2 (Mww, USGS)`, not a bare `5.2`. The two feeds do not
  always agree, and a bare number implies a precision that does not exist.
- **Relative time is rounded honestly.** "2 minutes ago", not "2m 14s ago". False precision on an
  event whose origin time is itself an estimate.
- No placeholder names, no invented round numbers, no sample data unless it is labelled sample data.

---

## 11. Performance Budget

Numbers, because an unenforced benchmark is quietly false within a month.

**CI gates on CPU update cost, not on frame time.** A shared CI runner has software rendering, so
GPU frame time measured there is noise. What actually regresses in code is the per-frame CPU work:
buffer writes, filter predicates, projection maths. That is deterministic and can gate a build.

| Events | CPU update per frame (CI, gating) | GPU frame p95 (reference machine, recorded) |
|---|---|---|
| 1,000 | under 1.0ms | 16.7ms, 60fps |
| 10,000 | under 4.0ms | 16.7ms, 60fps |
| 50,000 | under 12.0ms | 33.3ms, 30fps floor |

The reference machine is named and dated wherever a GPU number is published. "60fps at 10k points"
without the hardware attached is not a measurement.

**Bundle: four numbers, not one.** The original single 200KB figure was written before three.js was
measured, and three.js alone is 127KB gzipped. Under one number an app-code regression of 20KB reads
as 10% drift; against the thing that actually changed it is a third of the budget. Vendors are paid
for once and never move; application code and geometry are what drift, so they are watched apart.

| Chunk | Budget (gzip) | At step 2 |
|---|---|---|
| Application code | 60KB | 2.3KB |
| Coastline geometry | 40KB | 26.5KB |
| three.js | 135KB | 127.3KB |
| React | 50KB | 45.7KB |

If application code ever genuinely needs more than 60KB, the 40KB sitting in React is the lever:
nothing here uses React beyond components and effects, so `preact/compat` reclaims most of it. That
is a deliberate reserve, not a plan.
- **First arc in flight** within 2.5s on a 4x CPU throttle over a slow connection.
- **Memory flat over a simulated 4-hour session**, ring buffer capped, drift under 5MB. This is the
  failure that only appears in the demo left running during an interview.

---

## 12. Scope

**Shipping:** two keyless sources, the globe, hover, pin, filters, geographic navigation, the full
accessibility layer, and two ceiling-raisers.

**The two ceiling-raisers, chosen and justified:**

1. **Shareable permalinks.** Camera position, filters and selected event in the URL fragment. No
   backend, so it costs nothing, and it turns "look at this" into a link instead of a description.
   Highest leverage per unit of work in the whole project.
2. **Event clustering at low zoom.** Dense regions collapse into one sized marker until you zoom in.
   Chosen over the alternatives because it is the one that solves a legibility problem and raises
   the performance ceiling at the same time, which means it feeds section 11 and the write-up
   instead of sitting beside them. Clustering on a sphere is also genuinely harder than the planar
   version, which is the kind of detail worth having in the repository.

**Runner-up, and why it lost:** time scrubbing is the feature most likely to hold attention past the
first minute, but at $0 with no backend it can only replay what this browser has held since it
loaded. A timeline that cannot go back before page load is a worse version of the feature, and
shipping a worse version of a good idea is how a portfolio piece gets talked down.

**Cut:** accounts, saved sessions, a settings panel, a source picker, a separate landing page, and
every source past the second. The app is the landing page.

---

## 13. Banned

- Ambient globe rotation, and perpetual loops on any chrome element.
- Hue in the interface. No coloured buttons, no coloured active states, no accent glow. The
  atmospheric rim in 3.1 is the only exception and it is the only one that will ever be added.
- A photographic earth texture, cloud layer, or night-lights overlay.
- Pure black (`#000000`).
- Inter. Any serif.
- Proportional figures on any number that updates.
- Spinners over an empty canvas.
- A configuration screen, source picker, or landing page in front of the globe.
- Any source requiring a key, paid or free. The first frame must render for anyone who clones this.
- Scroll cues, "swipe to explore", bouncing chevrons.
- Emoji.
- A bare magnitude with no scale attached, a time window that misstates its own left edge, or a
  count that hides deduplication.
- Arcs between events. Two seismic feeds have no origin and destination, and a line between two
  quakes asserts a relationship that does not exist. See 3.3.
- Losing a pinned selection when the feed refreshes.
- Publishing a frame rate without naming the hardware it was measured on.
