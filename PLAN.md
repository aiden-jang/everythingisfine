# Everything Is Fine: build plan

The source doc is the layer above the code and explicitly defers the build sequence. This is that
sequence. [DESIGN.md](DESIGN.md) is the visual authority and is not restated here.

**One deviation from the source doc's ordering, stated up front.** Its section 8 puts visual
direction late, after accessibility and testing. That assumed the design would be decided later.
DESIGN.md exists now, so the palette, type and the two-palette rule land in step 1 and the visual
pass becomes an audit rather than a rebuild. Retrofitting a palette across a finished app is how
chrome ends up hue-tinted in three components nobody re-checked.

Every step has a **gate**: what must be true before the next one starts. The gates are the point.
A step that ships without its gate met is a step that gets paid for twice.

---

## Part one: working software (steps 1 to 9)

Nothing from the polish layer happens during these. The doc is right about that.

### 1. Shell

Vite, React, TypeScript, Tailwind v4. Geist and Geist Mono self-hosted from the package. The
DESIGN.md colour tokens as CSS custom properties. The three-zone grid, empty. `wrangler.toml` with
no `main`, `workers_dev = false`, custom domain, SPA fallback. Deployed on day one so hosting is
never a surprise later.

**Gate:** the empty layout is correct at 375, 768 and 1280, with no horizontal scroll at any width.
Nothing renders inside it yet. Getting the frame right while it is cheap to move is the entire
reason this is step 1.

### 2. The globe

three.js sphere, Natural Earth 110m TopoJSON, filled land, coastline stroke, 15 degree graticule,
atmospheric rim. Static, no camera control yet.

**Gate:** the tweet-size test from the source doc, run early rather than at the end. 600px wide, no
context. It has to read as an instrument, not a placeholder. If the land silhouette is mushy at that
size the 110m resolution or the stroke weight is wrong, and finding that out now is free.

### 3. Camera

Orbit with damping and momentum, cursor-anchored zoom, clamps at both ends, double-click reset.

**Gate:** it feels good to move with nothing on it. A camera that is unpleasant to drag when the
globe is empty does not become pleasant once it is covered in data, it just becomes harder to
diagnose.

### 4. The event model and the ring buffer

Pure logic, no network, no rendering. Normalised event shape, ring buffer, eviction, filter
predicates, geo projection maths. Driven entirely by committed fixtures.

**Gate:** the four-hour eviction test passes and memory is flat across it. The source doc is right
that this is the thing that works for an hour and fails at four, and it is far cheaper to test here
than through a renderer.

### 5. USGS adapter and the contract suite

The `GeoEventSource` interface, the polling adapter, and the shared contract every source must pass.
Recorded USGS responses committed as fixtures. One live test, excluded from CI.

**Gate:** the contract suite exists and is written to be source-agnostic before a second source
exists. Written after, it will accidentally describe USGS.

### 6. EMSC adapter and reconciliation

The WebSocket adapter against the same contract, unchanged. Then the part that only exists because
of the $0 constraint: the same earthquake arrives from both feeds, minutes apart, with different
identifiers, magnitude scales and epicentres. Identity resolution, a documented reconciliation
policy, and clean teardown when a source is toggled off.

**Gate:** a fixture pair of the same real quake from both feeds resolves to one event, and the
detail panel can show both readings. Also that stopping the WebSocket and leaving the poller running
orphans no listeners. This is the step most likely to be quietly wrong.

### 7. Rendering events

Instanced points. Magnitude to radius by square root, magnitude to ramp position, both ramps
switchable.

**Gate:** the section 11 budget met with synthetic events at 1k, 10k and 50k. Measured, recorded,
hardware named. This is the number the whole project gets judged on and it is the last moment where
changing the rendering approach is cheap.

### 8. Wavefront rings

Expanding rings at P-wave velocity, per DESIGN.md 3.3. Load seeds from the last hour of USGS and
replays the most recent ring once.

**Gate:** the first frame after a cold load has a ring expanding, on a throttled connection, every
time. Not usually.

### 9. Interaction

Hover tooltip, click to pin, detail panel, filters with no apply button, stats rail, click a region
to fly there.

**Gate:** a pinned selection survives a data refresh. Asserted in a test, not checked by hand, since
the doc is right that it is easy to write accidentally and it is the single most infuriating failure
here.

**End of part one.** Working software. Everything below is the layer above it.

---

## Part two: the layer above

### A. First thirty seconds and interaction feel

Source doc sections 1 and 2. Camera momentum tuning, hover states, entrance choreography, the
reduced-motion path in full.

**Gate:** the tweet-size test again, now with data. Three seconds, muted, no context, and it is
obvious this is live rather than a render.

### B. Accessibility and tests together

Source doc sections 4 and 5. The parallel accessible feed, recency-ordered keyboard navigation, the
threshold-gated live region, the colourblind toggle. Alongside them the Playwright interaction tests
and the visual regression pair.

Together because both are far cheaper now than retrofitted, and because the accessible feed is the
cleanest thing to write Playwright assertions against.

**Gate:** the globe is fully operable with the canvas hidden. If the app is unusable with the canvas
off, the parallel feed is decoration rather than a second interface.

### C. Visual audit

Not a build step. Walk the app against DESIGN.md section 13 and confirm no hue has leaked into
chrome, every updating number has tabular figures, and the time window states its own left edge.

**Gate:** a screenshot at each breakpoint in both ramps, four images, checked against the palette.

### D. The two ceiling-raisers

Permalinks first, since it is fragment-encoded and touches only camera, filters and selection.
Clustering second, since it changes the render path and wants the section 11 numbers re-measured
after.

**Gate:** the perf budget re-run after clustering lands, and the recorded numbers updated. A
clustering implementation that quietly regresses the 10k case has taken away more than it added.

### E. The write-up

`ARCHITECTURE.md` with rejected alternatives and the measurements that killed them. One long-form
piece, and the honest candidate is reconciliation: two feeds, one earthquake, two magnitude scales.
Nobody else writing up a globe demo has that problem, because nobody else was working at $0.

A thirty-second video. A limitations section that says where it degrades.

**Gate:** every number in the write-up traces to a committed test or a recorded measurement with
hardware and date attached.

---

## Keeping the decision log honest

Write `ARCHITECTURE.md` entries **on the day the decision is made**, not reconstructed at step E.
Reconstructed decision logs read as reconstructed: they are too tidy, every alternative loses for a
clean reason, and nothing was ever tried and abandoned. The entries worth having are the ones with a
measurement that surprised you, and those are the first thing memory smooths away.

The known entries already: no `main` on the Worker, vector coastlines over a satellite texture,
wavefront rings over arcs, CPU update cost over frame time as the CI gate, and clustering chosen
over time scrubbing.

## Out of scope

Accounts, saved sessions, a settings panel, a source picker, a landing page, a third source, and
anything requiring a key. All per DESIGN.md section 12.
