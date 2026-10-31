# Design system: Everything Is Fine

A live global event instrument. The globe is the first screen, real observations
supply its movement, and the interface explains what the sources can establish.
This is the current visual contract. [SYSTEM.md](SYSTEM.md) owns the system map;
[ARCHITECTURE.md](ARCHITECTURE.md) indexes implementation constraints.

## 1. Atmosphere

A dark observation deck: quiet, stable and instrument-like. Spend density on
readable numbers and controls while leaving the globe air. Data can move;
interface composition should remain still once an interaction settles.

## 2. Zero-cost and data boundaries

The visualization must render without an account, paid service or API key. Public
providers are reached directly from the browser. USGS polling and EMSC push/catalogue
readings share a reconciliation policy, while GDACS, EONET and NOAA supply their
respective layers. See [provider coverage](README.md#data-and-attribution).

A small Worker serves static assets and bounded anonymous aggregate analytics;
it does not proxy feeds or store an account/database. Fonts are self-hosted.
Preferences stay on the device and view state stays in the URL. Privacy-aware
analytics must retain its documented allowlist and opt-out boundaries.

Both agencies' readings remain visible. A stable primary reading positions the
marker; it is not a claim that one agency is correct. Never average magnitudes
from different scales or silently turn two accounts into an unquestioned fact.

## 3. Data and interface color

### 3.1 Interface chrome

Keep controls neutral and low-chroma. Active, focused and selected states use
brightness, weight and a visible ring. No saturated button accents, status dots,
selection colors or browser-default range tints. This includes text selection,
focus outlines and scrollbars.

`src/index.css` owns the tokens:

| Token | Value |
| --- | --- |
| Void | `#050b16` |
| Sphere | `#0a101c` |
| Land | `#1e293f` |
| Coast / plate | `#555663` / `#646478` |
| Deck / raised | `#0a1322` / `#101d33` |
| Text / dim / faint | `#e8edf5` / `#a9b5c7` / `#8997ae` |
| Hairline | `rgb(148 163 184 / 0.14)` |

A 2px text-color focus ring with a 2px offset remains visible. Never use pure black.
The atmospheric rim may use `rgb(120 150 190 / 0.16)` along the globe silhouette;
it is a named visual exception, not permission for colored controls.

Data-ramp marks outside the canvas carry `data-ramp`, including legends and the
individual values or swatches that explain a data encoding. The design test
excludes only the canvas and those explicitly marked elements. A whole panel must
not be exempted. Event-list text stays neutral rather than becoming a rainbow.

### 3.2 Magnitude and depth

`src/globe/ramp.ts` owns Thermal and Cividis and supplies the legend's exact
colors. Magnitude controls ramp position and marker radius; the same size mapping
is shared by the globe, legend and sequence. Do not normalize it to the visible
sample or spend hue on decorative categories. Radius remains useful without hue.

Depth uses shape: shallow discs, progressively opened holes and deep rings.
Missing depth retains its explicit unknown description. Clusters have their own
neutral ring and resolve into individual readings as the viewer zooms. Opacity
expresses transient interaction state rather than another permanent quantity.
The glossary's optional depth diagram uses neutral linework and is explicitly
labeled schematic and not to scale. It illustrates the view, without sample observations.

### 3.3 Wavefronts

An arriving earthquake creates an expanding ring centered on its epicentre.
Propagation uses approximately 6 km/s crustal P-wave velocity, played at ×20 with
the multiplier printed on screen. The front's rate and projection are derived,
not a decorative ease. Rings are bounded and reduced-motion aware.

Never draw an arc between unrelated earthquakes: neither feed supplies a journey
from one event to another. A cross-section or distance measurement is an explicit
viewer action and must identify what it measures.

## 4. Globe, map and sky

The canvas fills the viewport behind responsive panels. Vector geography and
readable event marks replace photographic Earth textures. Day/night follows the
displayed moment's real subsolar point; geography dims while observations remain
legible. The atmospheric rim adds form without competing with data.

Globe and map share geometry and a continuous projection. Longitude seams and
poles must remain coherent; the map wraps rather than splitting the Pacific with
empty edges. A cross-section states distance, depth and vertical exaggeration,
and exposes selected earthquakes through the same detail flow.

Stars, moon, planets and eclipse geometry follow the displayed time. Constellation
figures are optional interpretation and start off. Layer labels explain their
meaning and limits. Saved preferences take precedence over new-visitor defaults.

## 5. Typography

Self-hosted Geist carries display and UI; Geist Mono carries coordinates,
identifiers, timestamps and magnitudes. All updating numbers use tabular figures.
No serif or decorative display face. Keep labels readable instead of using
weight or very faint gray as a substitute for hierarchy.

The sentence-case masthead is 18px desktop / 16px phone, weight 600 with tight
tracking. The headline is 48px; selected magnitude 40px; detail/place headings
20px. Small metadata has deliberate spacing, and long agency/place names wrap.

## 6. Components

Buttons and toggles have flat raised fills, neutral borders, 7px corners and
brightness-based selection. Press feedback can move 1px. Phone hit areas are at
least 44px. Labels and accessible descriptions explain layer switches; icon-only
controls need meaningful names.

The summary uses open rows and internal rules. Analysis belongs under More
context, but feed-silence and unavailable-source warnings remain visible. Agency
readings use aligned rows for scale, coordinates and time. The detail sheet has
one consistent Close action, including hazard details with their own caveats.

Filters answer immediately without Apply. A pinned selection survives refresh
and remains explicitly labeled when excluded by filters. Point hover provides
an informative tooltip, with equivalent keyboard access through the event list.

Render geography before feeds answer. Loading is different from a successful
empty result. A failing source is named with its reason and retry, and must not
blank working layers. An empty filter result has a useful widening/reset action.
Empty phone lists occupy their status height rather than reserving absent rows.

## 7. Layout

Keep a fixed viewport with owned scrolling regions; horizontal page overflow is
a failure. At desktop the globe continues behind the floating rail/detail panels.
The 60px header groups view controls separately from utility actions. Folding a
region has an independently reachable restore control and never strands a stored
preference after resizing. Fullscreen expands the window without hiding its tools.

The rail shows recent live events and search before archive browsing. In archive
mode the chosen date and return-to-live action stay prominent. The glossary starts
folded and the magnitude scale remains visible. New viewers start with plate
movement arrows, deep seismicity and constellation figures off; saved choices win.

Phone layouts keep the subject visible above a draggable, keyboard-operable sheet.
View globe expands the canvas; Recent earthquakes opens more list space and
reveals recent events. The handle has a 44px target. Intermediate heights,
selection closing and preserved list position remain supported. Short landscape
and tablet views need their own reflow checks, not only portrait-phone coverage.

## 8. Motion

No ambient globe spin or perpetual chrome loops. The entrance is finite and data
appears promptly; do not delay initial fetching until an interval or animation ends.

Camera movement uses critically damped springs without overshoot. Long flights
pull back proportionally and settle with arrival; short hops do not add a flourish.
Camera keys, pointer, touch and wheel preserve the same bounds and motion policy.
Lost focus, backgrounding and dialog changes release held input.

Respect reduced motion completely: skip entrance rotation, camera easing and
secondary travel rather than merely shortening them. Keep events and every action
available. Replay, held time, archive mode and the sky share the displayed moment.

## 9. Accessibility

The canvas is hidden from assistive technology; the parallel event list carries
the information and actions. It is a real part of the product. Use roving focus
and recency order, with Enter for details and Escape for closing/unpinning.
Camera controls and timeline bins also work by keyboard.

A polite live region announces genuinely new events above the viewer's threshold,
not the backlog from initial loading. Visible control labels and accessible names
agree. Maintain contrast, focus and 44px phone targets in both ramp modes, all
sheet positions and every folded/loading/error state. Browser scans do not prove
spoken screen-reader output or physical-device usability.

## 10. Honest numbers

Keep magnitude scales attached. State the real coverage left edge, unanswered
sources, raw readings, distinct events and matched accounts. Counts describe the
filtered displayed set, not a hidden full buffer. Uncovered intervals are not
zero-event intervals. An archive is explicitly dated and never claims liveness.

Real logs, timestamps and provider limits determine readouts. Never infer a quiet
planet from failed requests or a low count from incomplete historical coverage.
Keep actual source provenance and agency descriptions available. Rank/comparison
claims must use the displayed time rather than knowledge from a future day.

The share image is geography without live event marks: a cached preview must not
pretend one day's earthquakes are current. A still names its held/archive/live
moment and states only its captured evidence. No unlabelled sample data, invented
counts or placeholder events on the production globe.

## 11. Performance and verification

CPU gates measure update work against a reference workload in the same process.
Use `src/globe/events.perf.test.ts` for enforced budgets; measurements are not
portable frame-rate promises. Retention and heap tests establish bounded growth.
Bundle reports distinguish application, geometry, celestial code and vendor cost.
Do not preserve old measurement tables as current performance claims.

The frame loop stops when nothing needs drawing. Data updates and camera movement
do not recreate the scene or subscriptions. Fetch optional geometry/catalogues
only when needed, release WebGL resources and honor context-loss recovery.
Still capture reads the drawing buffer synchronously before compositing clears it.

Use [quality checks](docs/quality.md) for current commands, browser journeys and
limits. Record hardware/conditions with any new performance finding in temporary
review output. Tests do not establish physical phone thermals, audio quality or
real-world provider availability.

## 12. Scope and sound

The app opens directly on the globe without registration, a source setup screen
or a separate landing page. Preserve keyless feeds, sharing, timeline/archive,
optional layers and accessible controls. A paid provider or private-data backend
changes the product boundary and requires an explicit decision.

Sound is opt-in, silent in hidden tabs and tied to genuinely new events using the
same threshold as announcements. Seeds and UI actions do not make sound. Pitch
and duration describe a transposed interpretation, not a recording of an
individual earthquake; disclose compressed loudness. No ambient bed or drone.

## 13. Banned

- Saturated interface accents, accent glows, pure black, serif typography or emoji.
- Ambient globe rotation, perpetual interface loops or bouncing exploration cues.
- Photographic Earth textures, decorative cloud layers or night-light overlays.
- Proportional figures in updating numbers, clipped names or horizontal page overflow.
- Spinners hiding the product, or blanking good data because another source failed.
- Mandatory accounts/API keys or a setup page before the first useful frame.
- Unexplained bare magnitudes, hidden deduplication or inaccurate coverage/liveness.
- Relationships fabricated between observations, or pins lost on a feed refresh.
- Performance claims without the hardware and measurement conditions.
