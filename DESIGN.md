---
name: Everything Is Fine
description: A dark observation deck for real Earth and sky readings.
colors:
  void: "#050b16"
  sphere: "#0a101c"
  land: "#1e293f"
  coast: "#555663"
  plate: "#646478"
  deck: "#0a1322"
  raised: "#101d33"
  ink: "#e8edf5"
  dim: "#a9b5c7"
  faint: "#8997ae"
  hairline: "rgb(148 163 184 / 0.14)"
typography:
  interface:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
  reading:
    fontFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace'
  explore-tab:
    fontSize: "22px"
    letterSpacing: "-0.02em"
  story-heading:
    fontSize: "clamp(28px, 2.15vw, 36px)"
    letterSpacing: "-0.035em"
  story-row:
    fontSize: "19px"
    letterSpacing: "-0.025em"
rounded:
  projection: "6px"
  control: "7px"
  feature: "9px"
spacing:
  compact: "8px"
  control: "12px"
  row: "16px"
  rail: "clamp(20px, 2.35vw, 38px)"
components:
  explore-rail:
    backgroundColor: "{colors.void}"
    padding: "{spacing.rail}"
  explore-tab:
    typography: "{typography.explore-tab}"
  story-hero:
    typography: "{typography.story-heading}"
    rounded: "{rounded.feature}"
  story-row:
    typography: "{typography.story-row}"
  story-search:
    rounded: "{rounded.control}"
    padding: "0 12px 0 38px"
  projection-current:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.projection}"
    padding: "0 12px"
  library-toggle:
    height: "44px"
  layer-times:
    backgroundColor: "{colors.deck}"
    rounded: "{rounded.control}"
    padding: "12px 16px 20px"
---

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

The visualization must render without an account, paid service or API key. Most public
providers are reached directly from the browser. USGS polling and EMSC push/catalogue
readings share a reconciliation policy, while GDACS, EONET and NOAA supply their
respective layers. See [provider coverage](README.md#data-and-attribution).

A small Worker serves static assets and bounded anonymous aggregate analytics;
its only feed relay is three fixed GFS and Coral Reef Watch routes cached for an hour.
The relay accepts no parameters and stores no account data or database. Fonts are self-hosted.
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

`src/index.css` owns the runtime colors; the frontmatter records their normative design values.

| Token | Role |
| --- | --- |
| Void | Page and desktop Explore rail |
| Sphere | Globe surface |
| Land | Geographic land |
| Coast / plate | Geographic boundaries |
| Deck / raised | Panels and selected controls |
| Ink / dim / faint | Primary, secondary and supporting text |
| Hairline | Quiet separators and control edges |

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

Story framing is interruptible on the shared globe and map. A deliberate drag, pinch, wheel or
camera key takes control without pausing the data timeline. Recenter restores the latest shot;
projection changes and frame updates preserve manual control. A new story starts with its own
framing. A visible following-camera control can release an authored shot before a gesture.
Map selection waits for a tap, so it does not consume pan or pinch gestures. Supported globe markers
use the same rule and an equivalent keyboard selector. City labels appear only at close Explore zoom,
with collision spacing and a small visible limit; geographic story previews never steal the camera.

Date comparisons hold one camera and switch actual observations without inventing intermediate images.
Two-place comparisons preserve source definitions, both timestamps and any local datum differences.
Layer focus is temporary and restores the visitor's chosen combination. Regional summaries distinguish
unanswered sources from an empty observed result.

Stars, moon, planets and eclipse geometry follow the displayed time. Constellation
figures are optional interpretation and start off. Layer labels explain their
meaning and limits. Saved preferences take precedence over new-visitor defaults.

## 5. Typography

Self-hosted Geist carries display and UI; Geist Mono carries coordinates,
identifiers, timestamps and magnitudes. All updating numbers use tabular figures.
No serif or decorative display face. Keep labels readable instead of using
weight or very faint gray as a substitute for hierarchy.

The sentence-case masthead uses weight 600 and tight tracking. Explore's desktop masthead grows
from 24–32px to 28–34px at the wide breakpoint; the phone retains its compact 16px treatment.
Explore tabs and story titles use the frontmatter's desktop roles, with smaller phone labels and
larger wide-screen rows. The featured title stays prominent above its source and explanatory line.
The Explore count is 38px, the selected magnitude is 40px, and detail and place headings are 20px.
Small metadata has deliberate spacing, and long agency/place names wrap.

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
scene-specific reference. The three scene controls share a quiet ruled strip with a clear active
underline and a small globe, depth or constellation diagram. A finite trace marks a selection;
reduced motion keeps the diagram still. Featured journeys live inside the selected scene’s catalogue.
Controls stay reachable in short landscape views.
Live Earth, Below the Surface and After Dark are explicit presets, not automatic layer changes.
Their temporary overrides do not overwrite saved scientific settings. The observatory retains source
status, scoped counts, capture and a direct Explore action, including empty or unavailable feeds.
Keep one featured experience and three initial suggestions inside each scene. In Explore, the
featured story uses a full-width recorded image, a readable lower gradient, title, source, short
description and Open story cue. Frame the artwork above the text, with the float at the upper right;
the image fades into the reading surface instead of competing with the copy. Keep category, heading
and search spacing compact. Three compact image rows follow, with their data type visible;
accessible descriptions and the full catalogue retain the explanation. View all and Library share
the footer below the selection. Library reveals Saved & recent, Guided journeys, Archives and
From feeds; those sections keep their individual disclosures. The full catalogue remains a
deliberate choice.
**Explore the globe** comes before the three illustrated scene filters. The landing overview starts
with none selected and the catalogue collapsed. Selecting a scene exposes its entries and brings
the search field into view on narrow screens; selecting it again returns to All stories. The wordmark
returns to the compact landing view.
There is no separate disclosure button for content the scene selection already opens. Closing an
experience returns focus to its entry point and restores the drawer’s scroll position.
Story thumbnails show recorded captures of their actual views. Float Dive, Rupture Reveal and
Moonfall retain native-resolution crops for the large feature; radar and sky previews are bounded
600px-wide crops. Load these WebP assets lazily and keep their capture origin, crop and conversion
in adjacent sidecars. Scientific imagery must come from the app's real rendered content, never
generated data or design-mockup pixels. Guided journeys use the drawer’s
existing quiet rows and each story’s reading panel, with manual steps, visible source context and
a return to free exploration. Onward links explain the relationship without implying shared dates
or causation between independent records. Keep the scientific scene large and the controls neutral.

Featured experiences precede a short selection. Recent visits sit in their own disclosure. Story discovery supports focus, hover and touch-hold
regional previews with an explicit Locate action. Timeline milestones use the dataset's actual imagery
and time resolution; synthetic flights say progress. Endings hold the final observation and evidence,
with onward exploration available. Reopening resumes a saved moment; replaying the entrance is explicit.

Story headings keep the return action above the title and the projection choice nearby; short
landscape observation panels put Back beside the title to keep playback visible. Moonfall’s
playback dock sits over the terrain on roomy desktops and returns to the scrolling control panel
on smaller screens. Radar prioritizes the selected scan time and playback before optional coverage
information. Explore presents the UTC time prominently with its date beneath it, and has one source
and coverage disclosure. Its Stories entry opens the same current scan and projection. Source
disclosures, unavailable states, and scientific distinctions remain readable.

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
Explore's initial rail width is 29.5% of the viewport, bounded to 320–480px; saved widths still
take precedence within the existing 264–620px resize bounds. Its header is 72px from 768px wide
and 76px from 1280px wide. The paired Globe/Map control identifies the current projection and
offers the other alongside it. Utility actions stay grouped separately. Folding a
region has an independently reachable restore control and never strands a stored
preference after resizing. Fullscreen expands the window without hiding its tools.

In Explore, Layers and Stories share the existing rail and canvas. Changing tabs never changes
projection, camera, playback or visibility. Scene diagrams filter Stories without taking the visitor
back to the landing page. Story returns restore pane, category, query, scroll, focus and camera.
At tablet widths and above, the canvas reserves room for the rail so it cannot cover the globe.

Layers use compact icon rows grouped into Weather & sky and Reported events, with independent
visibility switches and details controls. Coverage descriptions live in the inspector; loading and
unavailable states stay beside the affected row. Place search precedes the groups, with an explicit
Locate action so typing never moves the camera. All nine layers have equal weight; no inspector
opens initially except for an archived or shared earthquake target.
One inspector shows readings, source meaning, coverage and contextual controls. Enabled players
stay mounted when another inspector opens. Source failures are visible beside the affected layer.
Temporary isolation restores the chosen combination without changing stored preferences.

Earthquake counts, filters, timeline, search, archive, display choices, sound and tour controls belong
together in the earthquake inspector. The radar row includes its compact scan player while enabled. The
same mounted player expands
in the inspector, preserving the selected scan and playback. Other reports use equally accessible
inspectors with the
shared report window clearly named. Wind, lightning, radar and aurora retain independent source times.
Recent weather does not masquerade as an archived observation. Archive date and return-to-live stay
reachable when inspecting another layer. Find a place is distinct from report and story search.

Radar starts on unless a saved choice turns it off. One canvas information strip groups source
attribution, independent layer times and the legend; a secondary ruled row holds the author credit
and optional keyboard help on desktop. The compact radar caption keeps RainViewer attribution
visible with the selected UTC scan time, including when the rail folds. Guided
regional radar is a secondary action inside the radar inspector; returning restores the camera and
compatible scan time. The map legend stays with the canvas at every width, independent of the open
inspector. A collapsed legend occupies only its label width. On phones, its reading opens in a
viewport-bounded overlay with Close and Escape, keeping the trigger reachable at every sheet height.
Phone keyboard help lives in View options so it does not cover the globe. Detailed radar, wind and
lightning times open through Sources & times in a native, viewport-bounded popover at every width; Close and Escape
return focus to its trigger. Radar attribution remains outside that disclosure. Phones keep the scan
time inside the disclosure and player so the canvas footer stays on one row; desktop also shows UTC
beside the attribution. The full scan date stays available in the inspector. The phone author link sits at the
bottom edge with safe-area support; the scrolling rail has enough bottom padding to keep its final
content reachable above the credit. Background wind paths remain quieter than story paths.

The header offers projection, source status and View options at every width. Capture, fullscreen,
rotation and reset share that menu; keyboard help is a quiet optional disclosure. Phone layouts keep
the subject above a draggable, keyboard-operable sheet. Expand globe/map enlarges the canvas; the
other shortcut names the current pane rather than assuming earthquake activity. The handle and
interactive controls have 44px targets. The phone globe row starts at 43% of viewport height, with
a 280px floor bounded by 72% on very short screens. Stories starts at 34%, with a 240px floor bounded
by 65%, so its featured cover and the next complete row fit on a portrait phone. A manually adjusted
height takes precedence in either pane. Its lower stop is 20%, with a 180px floor
bounded by 60%; its upper stop is 82%. Browsing expands the sheet by reducing the globe row;
expanding the globe reduces the sheet. Within that row, the Explore canvas clears the 68px header
and leaves 12px below, keeping the default globe complete above the sheet.
The drag handle snaps to those three positions; keyboard arrows allow intermediate adjustments and
Home/End reach the extremes. Stored heights are bounded to the current viewport after rotation,
with enough canvas clearance for the header and legend on short screens.
Selection closing and preserved list position remain supported. Check short landscape and tablet
reflow as well as portrait phones.

## 8. Motion

Only the Live Earth landing view has ambient rotation: a slow camera orbit after the entrance
settles, at 2.4 degrees per second with an eased start. Steering pauses it immediately; it resumes
1.5 seconds after the last gesture and its momentum settle. **View options** provides a persistent
auto-rotation setting alongside image capture and fullscreen. Explore,
shared camera views, guided tours and stories keep their own framing. Rotation stops in hidden
tabs and under reduced motion; it does not advance the data clock or continually rewrite the URL.
No perpetual chrome loops. Data appears promptly; fetching never waits for animation.

Fresh visits and camera reset center on New York at the wide overview zoom in both globe and map.
Shared links, saved views and story framing keep their own coordinates.

The opening is a finite horizon-to-orbit shot with a close lens, a vertical framing offset and a
settling bank. **Reset view** can replay it. Navigation retains critically damped springs: long
flights pull back and bank proportionally; short hops remain direct. Grabbing or steering interrupts
the shot, and its lens offset settles independently. The flat map clears the cinematic lens.
Camera keys, pointer, touch and wheel preserve the same bounds and motion policy. Zoom spans 0.4×
to 12× on the globe, using lens magnification for close views without entering the atmosphere. The
map has its own plane distance and a viewport-aware overview; panning follows screen pixels at the
actual lens magnification and never snaps latitude to a newly calculated viewport boundary.
Lost focus, backgrounding and dialog changes release held input.

After Dark pitches the actual camera toward the sky, leaving Earth as a curved horizon.
Constellation tracing waits for that finite reveal to settle. Returning to another scene restores
Earth's framing; returning to a saved map settles the pitch before unwrapping. Steering interrupts
the reveal at its displayed position. Reduced motion uses the final sky composition immediately.
The sky catalogue keeps its displayed-time orientation throughout; no stars move to decorate the shot.

Tonight’s Sky approaches the selected city in the shared globe, then lowers and widens the lens
as the Earth limb gives way to a level horizon. The local compass holds its direction while time
changes. Twilight follows the Sun’s elevation and direction, and the Moon and planets follow the
displayed instant. Reduced motion uses the local view immediately.

Aurora overflight leaves the planetarium for a dark forecast oval. The camera lowers toward the
curved horizon, banks as the veil traces outward from the forecast focus, then settles over the pole.
The globe lighting, oval and readout use the same NOAA forecast instant. The elevated veil illustrates
the footprint at a display height. Steering ends the shot, and reduced motion shows the finished polar view.

Below the Surface approaches the selected region and lowers the camera toward the rim. The well opens
after the camera settles, then the reference guides trace downward. Steering can interrupt the shot,
and reduced motion starts at the finished composition. The depth scale and geographic anchor stay fixed.

The Tōhoku archive reveal holds the epicenter while the camera dives into the regional view.
A depth cutaway shows the modeled fault and the geographic layer reveals surface contours. The fault view uses USGS model timing and metres of slip, with fourfold depth exaggeration.
The surface view uses the preferred USGS ShakeMap contours and a separate intensity legend.
The motion pauses in hidden tabs, and either finished view can be opened directly.

Sun Watch stays inside After Dark. An archived solar close-up gives way to a schematic
flow informed by current wind speed and density, then clears to the same night-side globe.
The wind and X-ray plots have separate axes and observation times. Reduced motion opens on
Earth with the same three chapter controls.

Lights Return approaches Puerto Rico from After Dark, then opens the satellite archive at the
island’s projected size. Black Marble’s colors represent observed nighttime lighting in this bounded
archive view. The before-and-after divider holds the same position and scale in both images.
Reduced motion opens the baseline directly, with the same manual playback and comparison controls.

Katrina opens on a banked view of the Gulf horizon, follows the eye along NOAA’s best track and
settles to an overview at the Buras landfall. Track dots mark published fixes. Wind outlines use
the published quadrant radii, and the readings change at the fixes. Scrubbing and reduced motion
use the fixed overview.

Float Dive gives the estimated depth the main reading size, with pressure, measured temperature,
practical salinity and the sample traces kept adjacent to playback. Story returns and controls use
the same reading scale as Explore. Float Dive travels to the float’s recorded surfacing coordinates,
holds the locator ring, then
reveals a schematic water column in the same canvas. The instrument rises into surface light
while the plots follow the measured levels. Scrubbing stops playback at the selected sample.
Reduced motion opens directly with a fixed instrument and manual playback.

The Storm radar layer updates only the raster while the viewer steers the shared globe or map.
Its independent scan time remains visible; playback never drives the earthquake timeline.
The catalogue's Storm Radar view offers authored regional flights and optional NOAA detail.
Provider colors belong to the raster. Region changes reuse the camera flight, and reduced motion
cuts directly to the chosen view. Both entries share the scan player and bounded image loader.

The optional observation views keep one timeline through the existing globe and map morph.
Orbital Pass adds a city horizon, Tide Watch adds a measured gauge, and Wind Atlas traces
its vectors downwind as each forecast step arrives. Satellite imagery and tsunami travel
times stay pinned to geography. Recorded data and model output carry separate labels.
Live observation playback runs when requested. Recorded journeys may open with an authored flight.
Playback stops advancing while the page is hidden.

Tonga opens on the eruption’s infrared scans, widens through the water-vapor difference scans, then
pulls back into an orbit view on the shared globe. The ring is an estimate of the atmospheric wave. The station chart
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
it is not a model of the crust. Its depth guides draw in sequence at their true radii. Panel arrivals
retain readable content and cancel on replacement. Steering cancels presentation travel;
reduced motion and hidden tabs settle it immediately. Radar fades in once on enabling; changing
scans swaps the actual rasters immediately, without blending observations. Camera coordinates appear
briefly during user input. Every effect
finishes and releases the frame loop, except the explicitly controlled Live Earth landing rotation.

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

Live earthquake alerts are opt-in, silent in hidden tabs and tied to genuinely new events using the
same threshold as announcements. Seeds and UI actions do not make sound. Pitch
and duration describe a transposed interpretation, not a recording of an
individual earthquake; disclose compressed loudness. No ambient bed or drone.

Float Dive and Tide Watch also offer opt-in measurement tones. A short, quiet synthesized tone maps
the selected temperature or measured water level to pitch, with the mapping stated beside the
neutral Listen/Mute control. Sound starts only after a gesture and stops on hiding the tab, leaving
the view, or changing the profile or harbor. It is not a field recording, and never an ambient loop.

## 13. Banned

- Saturated interface accents, accent glows, pure black, serif typography or emoji.
- Globe rotation outside the controlled Live Earth landing view, perpetual interface loops or bouncing exploration cues.
- Photographic Earth textures, decorative cloud layers or night-light overlays.
- Proportional figures in updating numbers, clipped names or horizontal page overflow.
- Spinners hiding the product, or blanking good data because another source failed.
- Mandatory accounts/API keys or a setup page before the first useful frame.
- Unexplained bare magnitudes, hidden deduplication or inaccurate coverage/liveness.
- Relationships fabricated between observations, or pins lost on a feed refresh.
- Performance claims without the hardware and measurement conditions.

## Discovery and return visits

The landing stays quiet. The selected scene exposes one featured entry, a compact current-data
discovery list, and returning visitors their recent views. Sources and times explain why a suggestion
is relevant; no new feed or fabricated highlight is required. Saved views are local and removable.
A save confirms what was retained, while unavailable historical live scans explain the fallback.

Video recording lives beside Save image in View options. Its short status sits over the canvas,
leaving playback and navigation reachable. Recording does not introduce a second scene or change
its geometry. The preview appears only after recording ends and can be dismissed immediately.
