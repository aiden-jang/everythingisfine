# Design System: Everything Is Fine

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

**This app has two colour systems that must never touch.** One belongs to the data. One belongs to
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
| Landmass | `#1E293F` | Continent fill. 1.31:1 against Sphere, and 1.57x darker than the ramp's floor so it can never read as an event. Was `#151D2E`, which measured 1.13:1: not restraint, invisibility. |
| Coastline | `#31405D` | 1px land stroke. Raised further than the fill, because definition comes from edges and a brighter line adds crispness without adding mass. |
| Plate boundary | `#3D4E6E` | Tectonic edges at 90%, deliberately brighter than the coastline. A coastline is orientation; a plate boundary is the explanation for why the earthquakes are in a line, and in a seismic map the explanation should not be the fainter mark. |
| Graticule | `#243149` | Meridians and parallels at 38%. Deliberately left behind the land it sits under: it is scaffolding. |
| Deck | `#0D1420` | Rail and panel background. |
| Deck Raised | `#141C2B` | Detail panel, popovers, anything above the rail. |
| Hairline | `rgba(148,163,184,0.14)` | Structural 1px dividers. Never a full-strength border. |
| Instrument | `#E8EDF5` | Primary text, live counters, the selected event's ring. |
| Instrument Dim | `#8A96AC` | Labels, metadata, secondary readouts. |
| Instrument Faint | `#55617A` | Disabled states, ticks, timestamps at rest. |

Focus ring: **Instrument at 2px with a 2px offset.** Roughly 11:1 against Deck, well past the 3:1
that non-text contrast requires, and unmistakable for any data value.

**The second named exception: the legend.** The magnitude legend paints the ramp itself, outside
the canvas, and it must. A legend that cannot show the colours it explains is not a legend. It is
marked `data-ramp` so the design-contract test excludes that one element rather than loosening the
rule for everything, and so a third exception has to be argued for rather than slipped in.

Worth recording that the legend did not exist until somebody called the interface bad: the product
encoded magnitude in hue, three documents argued about which ramp to use, and nothing on screen ever
said what the colours meant.

**The first named exception.** The atmospheric rim, `rgba(120,150,190,0.16)`, carries a trace of hue.
It is allowed because it sits on the silhouette where no marker is ever drawn, it never encodes a
value, and a sphere without it looks like a flat disc. Naming the exception is the point: an
unstated exception becomes a precedent, and the next one will be a blue button.

### 3.1.0 The globe is lit, and the light is a fact

Day and night are drawn from the real subsolar point, computed from the clock. It is the one thing on
the canvas that is neither chrome nor data, and it earns its place twice: it gives the sphere a form,
so it reads as a planet rather than a disc, and it says *this minute* without a caption.

Achromatic, like everything else outside the ramp. A warm daylight would put hue on the one surface the
data is drawn against, which is the surface most in need of staying out of the way.

Geography dims; data does not. The land, graticule, plate boundaries and coastlines darken together on
the night side. The markers and wavefronts are drawn over it untouched, because an earthquake at 3am is
not a smaller earthquake.

### 3.1.2 One number may wear the ramp; sixty may not

The magnitude ramp appears outside the canvas in exactly two places: the legend, which has to show the
colours it is explaining, and the rail's largest-event line, which is a single value that has to be
readable at a glance from across the panel. Both carry `data-ramp`.

The sixty magnitudes in the event list are not coloured, and that is the same rule rather than an
exception to it. One number is a focal point; sixty are a rainbow, and a rail that competes with the
globe for hue defeats the reason the two-palette rule exists.

### 3.1.1 Defaults count as chrome

The two-palette rule applies to anything the browser will paint, not only to elements the contract
test can enumerate. `::selection` shipped unstyled for months and painted the platform's saturated
blue, and scrollbars shipped unstyled and are invisible on macOS while drawing a light channel on
Windows. Both are asserted by the design contract now. Anything a user agent styles by default is a
decision that has been made without you.

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

### 3.4 Depth, on the one channel left

Hue means magnitude and radius means magnitude, so neither is available, and inventing a second hue
would break the rule this whole section exists to protect. What remains is shape: **a shallow event
is a solid disc, a deep one is a ring**, and everything between is a disc with a hole opening in it.
The outer edge never moves, because that edge is the magnitude.

Worth encoding because depth changes what an earthquake *is*. Shallow events do the damage; events
below 300km happen inside a descending slab and are felt far more weakly for their size. Along a
subduction margin depth increases inland from the trench, so a diving plate now reads on the globe
as solid dots at the trench giving way to rings behind them. That is the Wadati-Benioff zone, and it
was in the data the whole time with nothing drawing it.

Boundaries are the conventional 70km and 300km. **A missing depth draws as shallow**, which is a
choice rather than an oversight: depth is genuinely optional in both feeds, neither shape is
neutral, and the tie goes to the far more common case. The detail panel still says "not given".

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

### 3.4.1 One quantity, one function, everywhere

Magnitude is drawn three times: marker radius on the globe, legend dot size in the rail, tick height in
the sequence strip. All three use the same square root of `magnitude - MAG_MIN`, and all three are
absolute rather than normalised to what happens to be on screen. A viewer who learns to read one has
learned to read all of them, and the same earthquake is the same size wherever it appears.

The sequence strip's first version scaled tick height linearly against ramp position, which put a swarm
of M2s and an M4.9 within seven pixels of each other. Two functions for one quantity is worse than a
slightly worse function used consistently.

### 3.5 Opacity is a state, not an encoding

Hue is magnitude. Size is magnitude. The carved hole is depth. Opacity is the one channel left and it
is deliberately **not** spent on a fourth quantity: it carries interface state only, and only while
something is happening.

- Holding an hour on the activity strip pushes everything outside it to 0.15, markers and wavefronts
  together, and releases the moment the pointer leaves.
- The two filter tracks dim their excluded ranges rather than removing them, so the scale stays whole.

The rule is that nothing permanent is ever said with opacity. A viewer who looks away and back must
see the same picture, and a faded marker has to mean "not what you are pointing at" rather than
"less of something".

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

**The weights, written down, because "weight-driven hierarchy" sat in this document for a long time while
the app used exactly one weight.** Geist Variable was loaded with its `wght` axis and everything on screen
was 400 except three uses of `font-semibold`. Hierarchy was carried entirely by three greys, which is one
axis doing two jobs: a heading and a caption differed only in how dim they were, and dimness is also how
this app says "less certain".

| | weight | tracking |
|---|---|---|
| Headline count, 38px | 650 | -0.015em |
| Panel magnitude, 30px | 620 | -0.012em |
| Wordmark, 13px uppercase | 550 | 0.16em |
| `.label`, 10px uppercase | 500 | 0.15em |
| Everything else | 400 | normal |

Two rules behind that table. **Tracking closes as size grows and never the other way**: large figures need
it, small ones are hurt by it, and `tabular-nums` still decides the widths so a live counter cannot twitch.
And **weight only ever goes up from 400, never below.** Light text on a dark ground blooms, so a thin cut
that looks elegant against white goes soft here, and the faintest prose is where that costs most.

---

### 5.1 Labels are rationed, and so are separators

An earlier version of this rail carried eleven small uppercase tracking labels, one above every block.
Each was defensible alone and together they were the thing that made the interface look dated: a
templated rhythm where every section wears a name badge. A 38px number above the words "last 24 hours"
does not need a heading reading EVENTS.

The rule is roughly one label per three blocks, and the survivors are the ones naming something a
reader could not otherwise work out. Regions and Recent stay. Activity and Events went.

The middle dot gets the same treatment: one per metadata line, not one between every pair of facts.
Two dots on a line means the separator is answering every relationship on it, and space answers most
of them without being read. Where three facts want comparing, they become columns instead, which is
what turned two agency readings from a concatenated string into a comparison you can scan.

**No rule under every row.** Sixty list rows each with a hairline beneath is the densest possible way
to say "these are separate", and the mono magnitude column and the hover state were already saying it.
At this density the panels lost their boxes too: a left rule and space carry a note without drawing a
container around it.

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

**The globe is the surface, not a component.** At desktop the canvas fills the frame and the rail and
panel float over it, translucent and blurred. The globe centres in the whole frame, so it continues
behind the panels rather than stopping at them.

**The legend belongs to the map.** It sits over the canvas beside the marks it explains, with the key
hints. On a phone it returns to the rail, because a floating panel over a 60dvh globe covers the
subject.

**Fullscreen takes nothing away.** `f` makes the window bigger and that is all it does. Hiding the bar,
the rail and the bottom band with it leaves a planet and nothing else: a screensaver, not a picture with
anything to read on it.

**Each region folds where folding it buys something, and nowhere else.** The rail is 356px of a 1440px
screen drawn over the globe, so it folds at `xl` and not below, where it is a strip or the page itself.
The bar is the reverse: floating it is transparent and costs the canvas nothing, so it folds below `xl`
and not above, where it is an opaque row taking 68px of a 768px screen. A control that hides something
free is a control that does nothing.

**The control that folds a region goes with the region.** So every fold needs a second control the fold
cannot reach: the bar's is a tab at the corner it left from, the rail's is a tab on the rail's own outer
edge, which becomes the frame's edge once the rail is gone.

**A preference remembered at one width must not strand a viewer at another.** A bar folded on a phone,
carried up to a desktop that offers no way to unfold it, would be hidden with nothing to press.

**Globe and map are one geometry, morphed.** The projection happens in the vertex shader from a single
shared uniform, so the switch is the planet unwrapping rather than a cross-fade. Every layer carries the
coordinates it was built from: deriving them back out of a position is wrong at the date line and
undefined at the poles. **The map has no edges**, because a map that stops at 180 puts the Pacific rim
in two corners with a void between them, and the Pacific rim is the thing worth looking at. The globe
is the default because it is the honest one; the map exists because comparing two margins on a sphere means
turning it.

**A long flight rises and settles.** Crossing a hemisphere used to keep the camera pressed against the
surface for the whole trip: the ground streaked past, nothing about the distance said the journey was
long, and arriving somewhere far looked exactly like nudging somewhere near. Flights now pull back over
the middle and come back in, by up to 45% of their own magnification, which also shows the reader where
they are going while they are still going there. **Scaled to the trip, and absent below 25 degrees**,
because a short hop that dollies out and back is a camera drawing attention to itself; full pullback is
reached at 110 degrees. The pullback still respects `ZOOM_MIN`, so an arc that starts from the framing
shot is clipped rather than losing the globe.

Zoom is slaved to how far along the path the camera actually is, not given a spring of its own. A fourth
spring chasing a moving target lagged it, so the pullback came out shallower than asked for and the climb
and the descent were not symmetric. As a function of position it inherits the easing already in the lon
and lat spring, and it is guaranteed to arrive at the same instant they do. The entrance is deliberately
left flat: "one opening, then stillness" is its own move and does not need a second one inside it.

**The sky is the real one.** 5,080 stars from the Yale Bright Star Catalogue down to magnitude 6, which
is about what an unaided eye reaches, placed by right ascension and declination and turned about the pole
by Greenwich sidereal time. The field it replaced was procedural, well tuned, and could never be
recognised: Orion was not there to be found, and a sky whose whole job is telling you which way you are
facing cannot do that job if none of it is real. Brightness only, no hue, so a blue Rigel beside an orange
Betelgeuse does not become a second place where colour means something.

Magnitude is spent on size and opacity together, each on its own curve, because the flux ratio across the
table is 1,400 to 1 and spending it literally leaves Sirius alone in an empty sky. Both curves are pulled
toward the faint end: 4,176 of the 5,080 are fainter than magnitude 4.5, so a curve that favours the
bright end draws almost the whole catalogue at the minimum size. Weight was matched against the field this
replaced by measurement, not by eye - lit pixels in a fixed patch of sky, 164 before and 101 after with
more of them bright.

**And there is a way in.** A short list of eclipses sits in the rail beside the notable days, setting the
cursor as well as the day, because a shadow lasts a few hours and an archived day opens at its own edge. It
is separate from the notable days rather than part of them: that list ranks by magnitude and an eclipse has
none. Seven rows, newest first, checked against the geometry rather than trusted.

**The moon's shadow, on the few days there is one.** Nothing new is measured for it: the sun's direction
and the moon's position are both already on screen, and a solar eclipse is the one place those two facts
multiply into a third. The umbra lands as a dark spot a few hundred kilometres across, which is what it is,
inside a soft penumbra some 3,500km wide. An annular eclipse draws no umbra at all, because the cone closed
before it arrived, and that falls out of the arithmetic rather than being decided.

**And the other way round: the moon goes red in the Earth's shadow.** This is the only warm value in the
app, and it is not a second exception to the ban on hue. The light reaching a totally eclipsed moon is
sunlight refracted through the Earth's atmosphere - it is the sunset ring around the planet, which is the
atmospheric rim, seen from the far end of the ray. The same admission, not a new one. Dim as well as red,
though nowhere near the ten thousand times fainter it really is: the point is that it is still there and no
longer white.

The same two cones give completely different answers in the two directions, which is the fact worth
noticing. The Earth's umbra is 0.72 radii wide where the moon crosses it and the moon is 0.27 across, so it
fits inside with room to spare - an hour of totality visible to half the planet. The moon's umbra arrives
at the Earth a couple of hundred kilometres wide or not at all.

**It says how well it knows.** "Placed to a few hundred km", because the position is an abridged lunar
series passed through sixty Earth radii of lever arm, and it is good to 466km on the 2024 April eclipse and
1,006km on the 2017 one. Every bounded number in this app says it is bounded, and a shadow that looked
precise is the one mark here somebody might plan a journey around.

**And the moon, at its real distance and its real size.** Sixty globe radii out and a quarter of a radius
across, which comes to half a degree, which is about eleven pixels. It is small, and that is the point: the
enormous moon everybody pictures is a long lens, and inflating it here would be the same lie as a
photographic earth texture. Nothing about it is scaled for effect, so it drifts against the stars as the
camera moves, because that is what parallax is at sixty radii.

**Its phase is not computed.** The scene already knows where the sun is, and a sphere lit from that
direction gives the crescent, the terminator and - the part hand-rolled phase code gets wrong - which way
the horns point. The terminator on the moon is hard where the Earth's is soft, because the Earth has air to
scatter light round its limb and the moon has none. The limb darkening is deliberately flattened: a Lambert
sphere renders a full moon as a bright centre fading to a dark rim, and the real one is famously flat to
the edge.

**The reader gets a mark, and it is the only one here that is not about the planet.** Four ticks around a
gap, at the city their timezone resolves to. Ticks because this app's corners are ticks or nothing, and
because every other glyph out there is a picture of the thing it marks - a spiral is a storm, a triangle a
volcano - and there is no picture of a person that is not either a borrowed pin or a joke. The gap is the
point: a cross through the middle would cover the ground it is identifying, and an earthquake at the same
spot is the coincidence a reader would most want to see.

**"Roughly" is not modesty.** A timezone is a zone, so the position is the middle of something that can be
a thousand kilometres across, and somebody in Vancouver gets a tick over Los Angeles. The key says so and
names the city, which is better than a tooltip because it is on screen without the mark having to be found
first. Nothing new is disclosed: the rail already used this to say what the closest earthquake to them was,
and it never leaves the browser.

**The five naked-eye planets are drawn as stars, deliberately.** Same colour, same brightness ramp, one
small nudge in size because a planet is a disc and reads steadier and fatter than a star of equal
brightness. Venus takes its place at the top of a scale the sky already establishes rather than becoming a
new kind of mark with a new rule. What the picture will not say, the key says: five of them are planets and
they wander. Scrub a month of archived days and they walk through constellations that hold still, which is
the observation the word comes from and the one thing a fixed catalogue can never show.

**The constellation figures are a toggle, and that is the point of them.** A real sky nobody can find
anything in is still a backdrop, because finding things in a sky means knowing which dots belong together.
But they are also the only layer on this globe that measures nothing: every other thing drawn here is a
reading, and nobody discovered that seven stars are a plough. So they sit beside the slab and the plate
motions, which are the other two layers that interpret rather than report, off until a reader asks. The
weight was set by measurement and then deliberately raised past it - somebody who presses a button marked
"figures" has asked to see figures, so the ceiling is what would start competing with the planet, not what
is barely there.

**Both rail edges are draggable and remembered**, by pointer and by arrow key. A fixed size is a guess
about what somebody is doing, and it is wrong about half the time. The width splitter trades the rail
against the globe; the one under the regions trades the regions against the event list.

**The key is ordered by subject, and it had to be put back that way.** Marks first, then everything
belonging to the planet - boundaries, the slab, the storms and fires and floods and the aurora - then the
sky, then the arrival rings, then the reader's own tick last, because it is the only row here that is not
about the world. Each row had been appended wherever was convenient as layers arrived, which left the
slab's note a hundred lines from the slab's row, the figures comment separated from the figures row, and
the reader's mark sitting between the plate boundaries and the stars belonging to neither. Nothing here is
new; it is the same rows in the order they always described.

**And the size chart lives inside the strip.** It is counts against magnitude where the bars are counts
against time - the same events, the other axis - and it had been placed below the whole component, which
put the play controls between two charts of one thing. It now sits under the strip's own footnotes and
above the transport.

**Controls above the rule, commentary below it, and the layers had drifted.** The legend states the split
in its own comment - the slider, the ticks and the source buttons change what is on the globe, and the rest
is what the marks mean - and four layer switches were sitting under the rule, inside a fold titled "What
the marks mean". Turning the slab on meant opening a glossary, which is not where anybody looks for a
control. They are now one wrapping row labelled Layers, beside the feeds. Each switch used to hang off the
row that explained it, and that adjacency was worth less than it looked: the buttons carry their own
labels, the glossary still explains each layer underneath, and a fifth layer now costs a word instead of a
paragraph. The two rows that existed only to name a layer follow the layer now rather than the platform,
because a key for a mark that is not on screen explains nothing.

This did not make the panel shorter. It is 558px with the layers off and 632px with two on, against about
533px before, because the new row costs roughly what the two conditional rows save. The height is driven by
the explanatory notes, and shortening it means trading the rule that no layer ships without its sentence -
which is a bigger decision than a layout one.

**The chrome is the globe out of focus.** The header floats on the canvas rather than sitting on a bar
above it, and the panels are 44% fill over a hard blur rather than a surface with the planet faintly
behind. The saturation of the blur is pulled down to match, because a thinner fill lets more of the
data ramp through and hue does not belong in the chrome.

**The section band is the one panel that goes further**, to 70% fill and zero saturation. It is the only
chrome that spans the full width of the canvas, so unlike the rail and the key it reliably has data
behind it, and it is the only chrome that is a drawing rather than type: the slab is 1.6px dots at a
quarter opacity, and at half saturation a cluster behind the band came through as a magenta glow and won.
Measured rather than assumed. The rendered chroma inside the rail and the key hints over live data is 53
against a ceiling of 55, unchanged between half saturation and none, which is why the other panels were
left alone. Note that the chroma test reads declared CSS colours and so cannot see backdrop bleed at all.

**Committed reference tables name their span, and never their age.** The slab key said "over five years"
and the ranking line said "the 1,826 days since 2020"; both tables stop on 2025-08-01 and do not move, so
both sentences pointed at the present and got wronger every month. They now read "2020 to 2025", from the
same constants the generators write. A relative age in copy backed by a frozen table is a fact with a
timer on it.

**The cross-section is the map's own view.** Shift-drag draws it, because a plain drag pans and a mode
button is a mode to get stuck in, and the hint row on the map says so. It opens as a band flush with
the bottom of the canvas, pushing the legend and the key hints up: while a section is open it is the
subject and they are chrome.

**Every view of an event can be clicked.** A mark in the section pins the same event a row in the list
or a dot on the globe would, and the pinned one is ringed in all three. A picture of events that cannot
be touched is a screenshot.

**A stated exaggeration, never a silent one.** Depth against distance is drawn 1:1 wherever the line is
short enough, and where it is not the factor is printed beside the length. An unstated stretch is a
lie about the dip of a slab, which is the one thing the picture is for.

**The panel leaves the way it arrived.** A close that cuts where the open slid is not restraint, it is
an unfinished transition.

Three zones: rail, canvas, detail panel. CSS Grid, never flexbox percentage maths.

- **1280px and up:** rail left (320px), canvas centre (`1fr`), detail panel right (360px) when an
  event is pinned. The globe sits slightly left of optical centre so a pinned panel does not shove
  it sideways.
- **768 to 1279px:** rail collapses to a top strip, detail panel becomes a right overlay. The strip
  takes a third of the height and no more, and the event list stands up inside it as its own column
  rather than lying under it as a full-width band. Given the band, one event took a 973px row and
  three of sixty were visible, with the strip's whole bottom-right corner empty: half the viewport
  spent on chrome that was mostly not there. The three tall blocks each take a column and span it,
  the short ones stack down the first, and the two that scroll show more of themselves for it.
- **Below 768px:** single column. Globe takes the top `60dvh`, rail becomes a scrollable sheet
  beneath, detail panel becomes a bottom sheet. **Not optional.** A passive watchable visualization
  gets most of its shared links opened on a phone.

**The band is measured wide as well as tall.** Every sample of the strip layout was portrait, and
short and wide is the same band with a third of the height to give it, which is also every half-screen
desktop window. It is a breakpoint in the contract now rather than a shape nobody looked at.

**No key hints on a phone.** Every entry names something a touch-only device cannot do: no arrow keys,
no `+`, no `0`, no shift to hold, no escape to press. The row's own rule is that it describes what
works in the current view, which is why it says pan on the map and orbit on the globe, and the honest
version of that list on a phone is empty. It was costing two wrapped lines over a 60dvh canvas.

`100dvh`, never `100vh`. Touch targets 44px minimum. Horizontal scroll at any width is a build
failure, not a bug.

---

## 8. Motion

**One opening, then stillness.** The entrance is a single sentence with two clauses: the last day
lands over 2.8 seconds, then the plate boundaries grow outward from the earthquakes over 1.5 seconds
and settle. A bright band travels at the growing end and cools to resting weight behind itself. After
that nothing moves until an earthquake arrives or the viewer touches something.

The boundaries are hidden until then, which is the whole point: the dots have to read as scattered
before the lines can resolve them. Growing from the events rather than fading in, because a fade says
nothing and a wipe has a direction that means nothing.


The globe rotates into its framing position once while the day arrives in the order it happened:
events appear on their own timestamps, the larger ones send their fronts out as they land, the counter
climbs and the clock in the rail runs through the day. Then the boundaries resolve it, and the camera
and the chrome go still.

The replay replaced a camera swing over a static scatter, because the wavefront is this product's
signature and almost nobody ever saw one: events arrive every few minutes, so somebody who opens the
page for ten seconds saw none of the motion the design is built around while the app sat on a complete
day of history and drew all of it at once, flat.

It is a replay and the rail says so, with the replayed clock rather than the real one. Nothing is
invented, reordered or retimed: the only thing being animated is *when the app chooses to draw*
something it already has. Any interaction ends it, and `prefers-reduced-motion` skips both clauses.

**No ambient rotation. No perpetual micro-loops on chrome.** This departs from the usual advice to
give every active component an infinite loop, and the reason is specific: this product's entire
claim is "this is happening right now". A pulsing chrome element is motion that means nothing, and
the moment a viewer sees motion that means nothing, all the other motion becomes suspect. Idle
chrome is what makes a moving arc read as real.

**Ruling: the ban is on motion that means nothing, not on requested motion with a destination.**
Written because the tour needed it and the working notes had paraphrased this rule as covering
rotation "even when a person starts it", which is not what the two paragraphs above say. What section
13 bans is *ambient* rotation, and the reason given here is meaning, not movement. A camera move is
therefore allowed only where it clears the bar the rule already sets, and the tour clears it on five
counts, every one of them a requirement rather than an argument:

- It is asked for. Nothing moves until the viewer presses it.
- Every stop is a real place with a live count, and **the rail names both while the camera is there**.
  Take the words away and this is a screensaver, which is what the rule exists to prevent.
- The stops come from live data, so a quiet margin is not on the route. There is no fixed slideshow.
- It ends. Six stops, then stillness, like the entrance's two clauses.
- **Any interaction kills it**, which is the entrance replay's own rule.

`prefers-reduced-motion` needs no special case: `flyTo` is already instant under it, so the tour
degrades by itself into cuts with dwells and no camera travel, which is the correct nothing.

- Camera: orbit with damping and momentum, zoom toward the cursor rather than the screen centre,
  clamped so the globe cannot be entered or lost. Double-click returns to the framing shot.
- **Every camera input goes through the spring.** The wheel used to assign zoom straight onto the
  camera, which is a 14% staircase per notch next to a `flyTo` that eases. One helper aims the camera
  for the wheel and the keys alike, and it compounds off the pending target so repeating an input
  faster than the spring settles still arrives where it should.
- **The globe is operable from the keyboard, and the keys are on screen.** Arrows orbit, `+`/`-` zoom,
  `0` resets, Shift goes further. The canvas being hidden from assistive tech does not cover this: a
  sighted person with no mouse is a different user. An undocumented shortcut is a secret, so the rail
  carries a hint row.
- **The page itself never scrolls, at any width.** This is a fixed-viewport instrument; the event list
  scrolls and on a phone the rail does. Scroll containers need `contain: paint` or their content
  reaches the document's layout overflow and the whole app can be dragged off the screen.
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

- **The time window states its own left edge.** With no backend the app knows only what its sources
  handed it, so a requested window can reach back further than anything it holds. The rail reads
  "since 21:40 · still filling" until coverage reaches the window, then switches. Getting this wrong
  is the difference between a demo and a claim.
- **Coverage is not arrival.** Both feeds seed a whole day in their first request, so every event in
  a full buffer arrives at page open. Reading the earliest arrival as the left edge made the rail
  say "still filling" permanently over a complete day: a rule written for an hourly seed, left in
  place when the seed became daily. A disclaimer that is always on is not read, which is worse than
  not having one.
- **The headline counts what is drawn, not what is held.** Every filter changes the globe, so every
  filter changes the number beside it. It was the buffer total, which meant dragging magnitude to
  5.0 emptied the globe and left the largest number in the rail sitting still.
- **An hour nobody watched is not a quiet hour.** The activity strip draws hours outside its
  coverage as blocks rather than as empty bars, because a zero-height bar is a measurement and this
  is an absence.
- **Relative time stays relative.** The strip's buckets are anchored to now, so the hour five bars
  back ends at 05:51 rather than 05:00. The readout says "5h ago" rather than printing a boundary
  nobody chose, which would be false precision dressed as a clock.
- **A deduplicated count is labelled as one.** If USGS and EMSC both reported an event, the counter
  shows distinct events, and the source breakdown shows the raw counts underneath.
- **Magnitude carries its scale.** `M 5.2 (Mww, USGS)`, not a bare `5.2`. The two feeds do not
  always agree, and a bare number implies a precision that does not exist.
- **A revised magnitude says what it was.** First estimates are automatic and get reviewed, so the
  panel reads "USGS first said 6.1, now 6.4" rather than quietly showing the new number. Same rule as
  the scale: a number that changed under the viewer without saying so claims a certainty it never had.
  It appears on the row and in the header count too, because a statistic about a set nobody can reach
  is not a disclosure.
- **Relative time is rounded honestly.** "2 minutes ago", not "2m 14s ago". False precision on an
  event whose origin time is itself an estimate.
- **Coverage is reported by whoever fetched it.** A source that successfully pulls a backlog says how
  far back its own request reaches, and only then does the window claim to be covered. Inferring it
  from "events have arrived" made the rail read "0 events, last 24 hours" when both seed requests had
  failed and two stray socket pushes landed.
- **A failing source is named, with its reason and its retry.** Not "error", and not silence. The
  status object has carried both since the first source was written; a header that says "one feed live"
  does not tell you whether the other is connecting or refused.
- **A link preview makes no claim it cannot keep.** The share image is the globe with its geography and
  no earthquakes, because a card is cached for days and a picture of one day's seismicity presented as
  now is unlabelled sample data.
- **The largest event in the window is named, not buried.** The list is ordered by time, which is
  right, and it means the one thing a person arrives wanting to know is forty rows down. The rail says
  it in one line and clicking it goes there.
- **A pinned event the filters exclude says so.** The panel is kept, because losing a pin to a nudged
  slider is worse than holding one, and it is labelled, because a full description beside an empty globe
  is the app showing something it is simultaneously claiming is not there.
- **An empty state says what it is waiting for, not what it lacks.** Before any feed answers, the rail
  reads "Asking USGS and EMSC for the last day." with no count, no header arithmetic and no strip
  readout, because a zero is a measurement and none had been taken. An empty list blames the filters
  only when there is something for them to exclude.
- No placeholder names, no invented round numbers, no sample data unless it is labelled sample data.

---

## 11. Performance Budget

Numbers, because an unenforced benchmark is quietly false within a month.

**CI gates on CPU update cost, not on frame time.** A shared CI runner has software rendering, so
GPU frame time measured there is noise. What actually regresses in code is the per-frame CPU work:
buffer writes, filter predicates, projection maths. That is deterministic and can gate a build.

**The CPU budget is a ratio, not milliseconds.** A millisecond threshold failed three times on
unchanged code, at 13.96ms and 13.11ms against 6.8ms quiet, because it cannot tell a regression from
a busy machine. The gate now measures a fixed reference workload in the same process and budgets the
ratio. Eight saturated cores move the ratio 4.12 to 4.29 where the milliseconds move 6.8 to 7.3.

| Events | CPU update (CI, gating) | Measured | GPU frame p95 (reference machine, recorded) |
|---|---|---|---|
| 1,000 | under 0.15 ref | 0.10 ref, 0.16ms | 16.7ms, 60fps |
| 10,000 | under 1.05 ref | 0.96 ref, 1.57ms | 16.7ms, 60fps |
| 50,000 | under 7.0 ref | 4.45 to 4.91 ref, 7.3 to 8.1ms | 33.3ms, 30fps floor |

**The 50,000 row said 6.0 for a while and the test said 7.0**, which is the failure this section opens by
warning about, in this section. 7.0 is the number in force and is kept deliberately: the ratio does not
cancel an oversubscribed machine, a second machine read 7.48 on code that passes here at 4.5, and a 6.0
gate would fail more often on a busy laptop without catching anything a 7.0 gate misses. Published at 7.0
with that reason attached rather than tightened to a figure nothing enforces.

The measured column is a range now, and re-measured rather than inherited: three runs at load average 16.8
on 2026-08-27. It was 4.12 when written; the sink attribute added 0.4 and deriving it back out of `aSink`
returned rather more than that.

Milliseconds are still printed, because "fast enough for a human" is a real question a ratio cannot
answer. The reference machine is named and dated wherever a GPU number is published. "60fps at 10k
points" without the hardware attached is not a measurement.

**Bundle: four numbers, not one.** The original single 200KB figure was written before three.js was
measured, and three.js alone is 127KB gzipped. Under one number an app-code regression of 20KB reads
as 10% drift; against the thing that actually changed it is a third of the budget. Vendors are paid
for once and never move; application code and geometry are what drift, so they are watched apart.

| Chunk | Budget (gzip) | At step 2 | 2026-08-27 |
|---|---|---|---|
| Application code (`index` + `Globe`) | 75KB | 2.3KB | 70.1KB |
| Coastline and plate geometry (`land`) | 40KB | 36.8KB | **41.1KB, over** |
| Celestial positions (`sky`) | counted, no ceiling yet | did not exist | 2.4KB |
| three.js | 135KB | 127.3KB | 128.1KB |
| React's API, preact's runtime | 15KB | 45.7KB | 7.8KB |
| Stylesheet | not counted | not counted | 8.3KB |
| Star catalogue, fetched behind the entrance | not counted | did not exist | 34.3KB |
| Deep seismicity, fetched on toggle | not counted | did not exist | 12.0KB |
| Timezone table, fetched on first use | not counted | did not exist | 5.8KB |
| Constellation figures, fetched on toggle | not counted | did not exist | 4.8KB |
| Plate motion, fetched on toggle | not counted | in geometry | 2.7KB |

**The geometry line is measuring its own name again.** It reached 43.5KB because `manualChunks` swept
everything under `/src/geo/` into `land`, so a star catalogue's loader, a lunar series, five planets and
two eclipse geometries were being counted against coastlines. They now have their own `sky` chunk: `land`
fell to 41.1KB and `sky` came out at 2.4KB, which accounts for the difference exactly.

**That saved nothing at load and was not meant to.** The sky draws on the first frame, so `sky` is
preloaded exactly as `land` is and is counted here for that reason. What it buys is that each line
measures the thing its name says, which is the only reason a budget catches anything.

**The React lever has been pulled, which is what it was reserved for.** Application code passed 60KB - the
app grew a real sky, a size distribution and a felt-report reader - and this section already named the
remedy: nothing here uses React beyond components and effects, so `preact/compat` behind React's API
reclaims most of it. That line went 45.7KB to 7.8KB, a saving of 38KB, and the application-code budget
rises to 75KB out of it.

Spending a reserve is not the same as raising a budget to match reality, and the difference is that the
four ceilings now sum to **265KB against the 285KB they summed to before**. The React line is cut to 15KB
in the same move, so the reserve cannot quietly reappear.

**`land` is still 1.1KB over.** The sky move accounted for its whole 2.4KB and no more, so this is real
growth in geometry-adjacent code. It would close by moving `sun.ts` and `antipode.ts` out as well, and that
is not being done: one accounting-only chunk was worth making because a line had stopped describing its own
name, and a second would be splitting chunks to hit a number rather than to describe one.

First load, all counted lines: **258KB gzipped**, down from 296KB.

The geometry line reached **42KB and was over budget** before the motion table was split out of it, and
nobody knew, because "At step 2" was measured once and never measured again. A budget column that is not
re-read is a decoration. The motion chunk is listed separately and deliberately not counted against
geometry: it is fetched only if the arrows are switched on, so charging it to the first paint would make
the number describe a load that does not happen.

~~If application code ever genuinely needs more than 60KB, the 40KB sitting in React is the lever.~~
**Spent on 2026-08-27.** Application code reached 70KB and `preact/compat` took the React line from 45.7KB
to 7.8KB. The source still imports from `react` throughout and `@types/react` stays as a dev dependency,
because compat implements that API and React's types are an accurate description of it: only the runtime
changed. There is no second reserve of this size, so the next 15KB of application code is a real decision
rather than a withdrawal.
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

## 12b. Sound

Written before any audio existed, because this document said nothing about it and a feature built into
that silence would have set the rule by accident.

**Sound is an event channel, never an ambience.** The same test section 8 applies to motion applies here
and harder: a tone that means nothing makes every other tone suspect, and audio cannot be looked away
from. So there is no drone, no ambient bed, no interface feedback on hover or click, and nothing at all
happens on a quiet globe. One earthquake arriving is one sound.

**It follows `newsIn`, not the store.** A cold load admits sixty events at once and none of them just
happened; the live region already learned that the hard way and decides news by the clock. Sound reuses
that exact predicate rather than a new one, so a seed can never be audible. It also reuses the announce
threshold instead of adding a second slider: "tell me about events above this" is one idea.

**Off by default, and it must be.** Autoplay policy requires a gesture, which happens to agree with the
right design. It is silent until asked, one press to stop, and it never carries information the marker and
the list do not already carry, so nothing is lost by leaving it off. Silent while the tab is hidden: a
background tab making noise is a bug in any app.

**The transposition is stated, like the wavefront multiplier.** Real ground motion is below hearing - under
about 10 Hz - so any audible rendering is a transposition and not a recording, exactly as the wavefronts
are sped up x20 and say so. The mapping is derived rather than composed: **lower pitch for larger**, which
is the direction real ruptures go as their corner frequency drops, and longer, because bigger ruptures last
longer. Loudness is the one thing that cannot be honest - three points of magnitude is thirty thousand
times the energy and no speaker can say that - so gain is compressed and the legend admits it.

**Banned in audio:** a drone or ambient pad, click and hover feedback, a sound on any interface action, a
looping bed under the globe, and any tone presented as what an earthquake sounds like.

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


## October 11 interface revision

The globe, data ramps, fixed viewport and responsive rail remain the product's frame.
The masthead now uses sentence case at 18px (16px on phones), weight 600 and tight
tracking. A 60px desktop header gives the 32px controls room. Controls use 7px corners,
with brightness and a neutral border identifying selected states. The headline is 48px.
The summary uses open rows and internal rules rather than a surrounding box and corner ticks.
Instrument is #E8EDF5, Dim #A9B5C7 and Faint #8997AE for clearer small text.
These deliberately supersede the earlier masthead, 38px headline and summary frame specifications.

The glossary starts folded; the magnitude scale remains visible. Constellation figures
start off, as an interpretation layer requested by the viewer. Remembered preferences
still take precedence, and feed, filter, selection and archive behavior are unchanged.

On a live view, archive browsing follows the recent list and place search. An active
archive keeps its date and return-to-live control near the top. This gives live events
priority without concealing which historical day is being shown.


### Second interface pass

The rail's analysis lives under More context; feed silence warnings remain outside
that fold. The selected event uses a 40px magnitude and a 20px place heading. Agency
readings use two aligned rows per source so scale, coordinates and time remain legible
without truncating the comparison. Desktop utility actions are grouped apart from
view controls. The phone sheet retains its drag and keyboard behavior with a wider,
44px handle target, and selected-event sheets use rounded upper corners. The map key
keeps its visual encoding examples and folds the plate-motion explanation separately.

The favicon is a simplified globe and orbital dot. The share card uses the same
sentence-case wordmark and self-hosted Geist, with geography and no live event marks.

### Globe legibility

Overview clustering uses wider cells and persists slightly further into zoom, reducing
overlapping marks along dense seismic margins. Cluster rings still represent grouped
events; zooming in resolves individual readings. Selection keeps its distinct corner
brackets, with a heavier stroke and neutral shadow for contrast over geography.
Layer controls use Plate movement, Deep earthquakes and Constellations; stored
preferences and the layers themselves keep their existing behavior.

### Mobile exploration and default layers

New viewers start with plate arrows and historical deep seismicity off, keeping live
earthquake marks in focus. Depth remains visible and saved layer choices still win.
Phones expose View globe and Recent earthquakes above the sheet: the first expands
the canvas, the second opens more list space and scrolls to recent events. The drag
handle still allows intermediate heights. Pinned details keep their existing close
control and return to the list's preserved position.

### Final interface consistency

Layer switches carry adjacent short explanations and accessible descriptions. Feed
status distinguishes responses still loading from unavailable sources, with a compact
answered/total readout on phones. Hazard sheets share the earthquake panel's Close
control and 20px place/title scale, retaining each hazard's own facts and caveats.

Empty phone lists shrink to their status message rather than reserving rows for absent events.
