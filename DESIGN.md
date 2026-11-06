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

The explorer canvas fills the viewport behind responsive panels. Vector geography and
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
tracking. The Explore count is 38px, the selected magnitude is 40px, and detail and place headings
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

## Observatory presentation

A fresh visit leads with the planet and “Meanwhile, on Earth.” The editorial heading uses Geist,
with larger, tighter type than the scientific controls. It remains neutral and readable. Existing
saved layouts stay in Explore; direct content links expose their content without an intro in front.

On wide screens, the introduction and globe occupy separate columns. On phones, the planet sits
above a bounded introduction with owned scrolling. The globe stage carries a UTC readout and one
scene-specific reference. The three scene controls share a ruled strip, with a distinct diagram and
accent for each mode. Controls stay reachable in short landscape views.
Live Earth, Below the Surface and After Dark are explicit presets, not automatic layer changes.
Their temporary overrides do not overwrite saved scientific settings. The observatory retains source
status, scoped counts, capture and a direct Explore action, including empty or unavailable feeds.
Live experiences belong beside their scene. Historical replays and choosing a UTC date have
separate entry points.

Guided narration uses captured primary readings and regional counts. Explain magnitude scales,
reported depth, historical reference points and the time scope; never manufacture a journey between
unrelated earthquakes. Reading time begins at camera arrival and pauses in hidden tabs. Viewer
interaction ends the tour except within its narration and controls. Escape always stops it.

Live Earth traces the day–night boundary from the displayed Sun direction. The sweep settles into
a thin reference line. Reduced motion shows the full boundary immediately. Surface lighting may
use the displayed sun and the sphere's actual normals to improve form. It must
not fabricate topography, add photographic textures, dim earthquake measurements, or alter the
flat-map palette. Presentation crossfades are finite and skipped under reduced motion.

## 7. Layout

Keep a fixed viewport with owned scrolling regions; horizontal page overflow is
a failure. At desktop the globe continues behind the floating rail/detail panels.
The 60px header groups view controls separately from utility actions. Folding a
region has an independently reachable restore control and never strands a stored
preference after resizing. Fullscreen expands the window without hiding its tools.

In Explore, the rail shows recent live events and search before archive browsing. In archive
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

The opening is a finite horizon-to-orbit shot with a close lens, a vertical framing offset and a
settling bank. **Reset view** can replay it. Navigation retains critically damped springs: long
flights pull back and bank proportionally; short hops remain direct. Grabbing or steering interrupts
the shot, and its lens offset settles independently. The flat map clears the cinematic lens.
Camera keys, pointer, touch and wheel preserve the same bounds and motion policy.
Lost focus, backgrounding and dialog changes release held input.

After Dark pitches the actual camera toward the sky, leaving Earth as a curved horizon.
Constellation tracing waits for that finite reveal to settle. Returning to another scene restores
Earth's framing; returning to a saved map settles the pitch before unwrapping. Steering interrupts
the reveal at its displayed position. Reduced motion uses the final sky composition immediately.
The sky catalogue keeps its displayed-time orientation throughout; no stars move to decorate the shot.

Aurora overflight leaves the planetarium for a dark forecast oval. The camera lowers toward the
curved horizon, banks as the veil traces outward from the forecast focus, then settles over the pole.
The globe lighting, oval and readout use the same NOAA forecast instant. The elevated veil illustrates
the footprint at a display height. Steering ends the shot, and reduced motion shows the finished polar view.

Below the Surface approaches the selected region and lowers the camera toward the rim. The well opens
after the camera settles, then the reference guides trace downward. Steering can interrupt the shot,
and reduced motion starts at the finished composition. The depth scale and geographic anchor stay fixed.

The Tōhoku archive reveal holds the epicenter across a regional camera dive and the return to an
overhead map. The fault view uses USGS model timing and metres of slip, with fourfold depth exaggeration.
The surface view uses the preferred USGS ShakeMap contours and a separate intensity legend.
The motion pauses in hidden tabs, and either finished view can be opened directly.

Sun Watch stays inside After Dark. An archived solar close-up gives way to a schematic
flow informed by current wind speed and density, then clears to the same night-side globe.
The wind and X-ray plots have separate axes and observation times. Reduced motion opens on
Earth with the same three chapter controls.

Katrina opens on a banked view of the Gulf horizon, follows the eye along NOAA’s best track and
settles to an overview at the Buras landfall. Track dots mark published fixes. Wind outlines use
the published quadrant radii, and the readings change at the fixes. Scrubbing and reduced motion
use the fixed overview.

Storm Radar flies from the current globe view to the contiguous United States or an area with
visible returns. NOAA reflectivity colors belong to the raster. The scan controls stay in the
Observatory panel, and scrubbing changes only the scan at its published UTC time. Region changes
reuse the camera flight. Reduced motion cuts directly to the chosen view.

Tonga opens on the eruption’s infrared scans, widens through the water-vapor difference scans, then
pulls back into an orbit view. The ring is an estimate of the atmospheric wave. The station chart
stays tied to measured pressure on the same UTC clock. Chapter jumps and reduced motion use static
framing.

Kīlauea starts tilted over Fissure 8 and follows the mapped extent toward Kapoho Bay. The dated
HVO overflight marks the ocean entry. The camera levels at the bay for the shoreline wipe, which
holds scale and position so the former coast and the new land can be compared. Reduced motion
uses fixed maps and the manual wipe.

Iceberg Drift opens on Terra MODIS, banks along A-68A’s track, and cuts to Landsat and VIIRS
on their capture dates. The flight levels into a regional map as the tracks diverge. Selecting
a fragment highlights its path and jumps to its last recorded fix. Reduced motion opens a
still and keeps the date slider and track picker available.

Megaflash banks over a false-color infrared scan and slows the observed optical spread
so the newest pulses stand out against the accumulated trace. It levels into a five-state
map. Scrubbing and reduced motion use the same level framing.

The globe opens into a curved sheet from its map seam. The camera pulls back to show the curl, then
settles at the selected map location. The same path wraps the sheet back into the globe, and changing
direction continues from the displayed frame. Reduced motion switches directly between the projections.

Releasing a drawn map section uses the line as the hinge for the depth plot. The plot opens beneath
its surface datum and settles into the bottom panel. A section from a link or event panel, an empty
corridor, and reduced motion open directly.

Selection brackets may settle once, panels may catch a brief neutral edge light, and zoom regrouping
may crossfade recorded marker positions. These effects must not invent intermediate epicentres or
change magnitude encoding. Optional constellation lines trace their catalogue connections with a brief leading glint on
opening. Bright stars may leave short photographic exposure trails along camera travel; catalogue
directions and resting brightness remain unchanged. Reset the exposure after idle, tab pauses and
viewport changes. Scene lighting may briefly catch the surface and atmosphere during a reveal;
this is a display treatment, not another measurement layer. A regional cutaway uses actual earthquake depths and clearly labelled reference guides;
it is not a model of the crust. Its depth guides draw in sequence at their true radii. Camera coordinates appear briefly during user input. Every effect
finishes and releases the frame loop, with no permanent background animation.

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
