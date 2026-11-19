---
name: meanwhile.
description: Aperture, a planet-first observation deck for real Earth, ocean and sky readings.
colors:
  void: "#091219"
  sphere: "#0a101c"
  land: "#1e293f"
  coast: "#555663"
  plate: "#646478"
  star: "#c8d2e2"
  moon: "#b8b4ae"
  eclipsed: "#6e4b3c"
  deck: "#111f26"
  raised: "#1a2d35"
  ink: "#edf3f3"
  dim: "#a4b6bc"
  faint: "#8da3ab"
  feed-available: "#92c4a8"
  feed-unavailable: "#dcb3ab"
  hairline: "rgb(148 163 184 / 0.14)"
  rim: "rgb(120 150 190 / 0.16)"
typography:
  display:
    fontFamily: '"Alumni Sans", "Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(112px, 12vw, 176px)"
    fontWeight: 600
    lineHeight: 0.86
    letterSpacing: "-0.025em"
  story-display:
    fontFamily: '"Alumni Sans", "Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(38px, 3.5vw, 54px)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  interface:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
  reading:
    fontFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace'
  body:
    fontSize: "16px"
  action:
    fontSize: "15px"
  control:
    fontSize: "14px"
  caption:
    fontSize: "13px"
  label:
    fontSize: "12px"
  metadata:
    fontSize: "11px"
  brand:
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  explore-tab:
    fontSize: "22px"
    fontWeight: 550
    letterSpacing: "-0.02em"
  story-heading:
    fontFamily: '"Alumni Sans", "Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(34px, 3vw, 44px)"
    fontWeight: 550
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  story-row:
    fontSize: "19px"
    fontWeight: 550
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  inspector-heading:
    fontSize: "28px"
    fontWeight: 550
    letterSpacing: "-0.03em"
  magnitude:
    fontSize: "40px"
rounded:
  field: "2px"
  projection: "6px"
  control: "7px"
  card: "9px"
  explorer-sheet: "16px"
  observatory-sheet: "20px"
spacing:
  compact: "8px"
  control: "12px"
  row: "16px"
  panel: "22px"
  rail: "clamp(20px, 2.35vw, 38px)"
components:
  explore-action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.void}"
    typography: "{typography.action}"
    rounded: "{rounded.field}"
    padding: "12px 18px"
  utility-button:
    textColor: "{colors.dim}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "44px"
  utility-button-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  explore-rail:
    backgroundColor: "{colors.deck}"
    padding: "{spacing.panel}"
  explore-tab:
    typography: "{typography.explore-tab}"
  story-category:
    rounded: "{rounded.projection}"
    padding: "8px 5px"
  story-category-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  story-hero:
    typography: "{typography.story-heading}"
    rounded: "{rounded.field}"
  story-row:
    typography: "{typography.story-row}"
  story-search:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
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
  creator-credit:
    textColor: "{colors.dim}"
    typography: "{typography.metadata}"
---

# Design System: meanwhile.

## Overview

**Creative North Star: "Aperture"**

Aperture is a dark observation deck with the planet as its observation surface. Deep teal
space, pale ink and condensed display type give the invitation its scale. Quiet ruled controls
leave room for real geography, observations and the sky; scientific colors retain their meaning.

The same globe reframes from the invitation into exploration and cinematic stories. Composition
is deliberate and open at the entrance, then dense where reading and operating require it. Motion
is finite and interruptible, and the interface settles once an interaction completes.

**Key Characteristics:**

- One shared globe and map across the invitation, exploration and cinematic stories.
- Alumni Sans for the invitation and selected story headings; Geist for readable interface text.
- Deep teal surfaces, pale ink and neutral controls with distinct scientific color encodings.
- Recorded story imagery separated from its reading text, with complete discovery and return paths.
- A stable lower-left author credit and continuous, reversible world framing.

[PRODUCT.md](PRODUCT.md) owns product truth, [SYSTEM.md](SYSTEM.md) owns the system map, and
[ARCHITECTURE.md](ARCHITECTURE.md) indexes implementation constraints. The Observatory surface
contract carries the approved first-viewport composition; this system records its reusable rules.

## Colors

Aperture uses deep teal and pale ink for the interface, with the established scientific
neutral geography and source-owned ramps kept distinct.

### Neutral

Keep controls neutral and low-chroma. Active, focused and selected states use
brightness, weight and a visible ring. Keep selection, focus, scrollbars and ranges in the neutral
palette. Feed health uses muted green and warm accents with distinct shapes and text equivalents.

`src/index.css` owns the runtime colors; the frontmatter records their normative design values.

| Token             | Role                                            |
| ----------------- | ----------------------------------------------- |
| Void              | Deep teal page, landing and open canvas ground  |
| Sphere            | Globe surface                                   |
| Land              | Geographic land                                 |
| Coast / plate     | Geographic boundaries                           |
| Deck / raised     | Blue-green reading panels and selected controls |
| Ink / dim / faint | Primary, secondary and supporting text          |
| Hairline          | Quiet separators and control edges              |

A 2px text-color focus ring with a 2px offset remains visible. Keep the dark teal ground
distinct from pure black. Star, moon and eclipsed tokens describe scientific legend swatches;
they do not become interface accents.
The atmospheric rim uses the named rim token along the globe silhouette;
it is a named visual exception, not permission for colored controls.

Data-ramp marks outside the canvas carry `data-ramp`, including legends and the
individual values or swatches that explain a data encoding. The design test
excludes only the canvas and those explicitly marked elements. A whole panel must
not be exempted. Event-list text stays neutral rather than becoming a rainbow.

### Scientific encodings: magnitude and depth

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

### Scientific encodings: wavefronts

An arriving earthquake creates an expanding ring centered on its epicentre.
Propagation uses approximately 6 km/s crustal P-wave velocity, played at ×20 with
the multiplier printed on screen. The front's rate and projection are derived,
not a decorative ease. Rings are bounded and reduced-motion aware.

Never draw an arc between unrelated earthquakes: neither feed supplies a journey
from one event to another. A cross-section or distance measurement is an explicit
viewer action and must identify what it measures.

**The Data Color Rule.** Neutral chrome never borrows a scientific ramp. Mark data encodings precisely and keep legends faithful to the rendered measurements.

## Typography

**Display Font:** Self-hosted Alumni Sans, with Geist and the interface sans stack as fallbacks.
**Body Font:** Self-hosted Geist Variable, with the interface sans stack as fallbacks.
**Label/Mono Font:** Self-hosted Geist Mono Variable for coordinates, identifiers, timestamps and magnitudes.

**Character:** Condensed Alumni Sans gives the invitation a clear silhouette. Geist keeps controls,
source context and story descriptions readable; the mono family makes geographic readings steady.
Alumni Sans is a variable upright font licensed by the adjacent SIL Open Font License file.

### Hierarchy

- **Display:** The frontmatter's display role belongs to “Look closer.” on the full landing view.
  It has a deliberate two-line break, close line height and regular numeric forms. Tall layouts
  below 900px use `clamp(76px, 23vw, 108px)`; tall phones at 380px or narrower use 60px and
  viewports no taller than 620px use 52px. Desktop layouts from 621px to 860px high use
  `clamp(88px, 15dvh, 124px)` so the headline leaves room for the description and actions.
- **Story display:** Alumni Sans uses the story-display role in observation, Tonight’s Sky,
  radar and Float Dive player headings. Other reading and scene headings retain their established type.
- **Featured story title:** Alumni Sans uses the story-heading role above the source and short promise,
  with a 34px phone treatment. This title is reading content, separate from the image. The landing
  invitation uses a 28px condensed title beside its recorded thumbnail, or 23px on narrow tall phones.
- **Title and navigation:** Inspector headings use the inspector-heading role. Explore tabs use
  the explore-tab role, 19px on phones and `clamp(22px, 1.65vw, 26px)` at the wide breakpoint.
  Recommendation titles use the story-row role, 15px on phones and 18px at wide desktop widths.
- **Body and controls:** Body/search, action, control and caption roles maintain the established
  16–13px reading hierarchy. Landing prose has a 29ch measure, 14px desktop type and a 1.7 line
  height, becoming 13px/1.6 on tall smaller screens. Labels and source metadata use their named roles.
- **Wordmark:** The compact two-line “Everything / is fine.” uses the brand role, with 17px type
  below 768px. Its identity and line break stay stable across home, Explore and players.
- **Scientific readings:** Keep the selected magnitude at 40px, detail/place headings at 20px,
  and each inspector's established count treatment. These values are reading hierarchy, not display decoration.

**The Steady Readout Rule.** Use tabular figures for updating numbers; display headlines and the wordmark use regular figures. Long agency and place names wrap instead of clipping.

## Layout

### Aperture invitation

The full-viewport landing fits the globe beside a large invitation on desktop and above it on
phones. The first visible frame uses the overview lens and fits the whole planet in the canvas.
The introduction and its actions sit together in a 42% reading track with 34px horizontal and
64px bottom clearance.
Explore the globe is the pale filled action and Browse stories is secondary. Category filters
and returning-visit controls live in the catalogue. Feed availability remains accessible in the header.
Desktop layouts from 621px to 860px high reduce the headline size and top inset.

Tall layouts below 900px place the globe above the introduction and cap its height to leave room
for the invitation on tablets. The introduction owns vertical scrolling and 24px side insets.
The two entry actions remain reachable below the headline. Viewports at 620px high or less use the
compact headline, reduced gaps and owned scrolling; the established player landscape layouts
continue to keep playback visible. Landscape layouts at least 600px wide use a 64px top inset
and side-by-side entry actions. The short landscape footer keeps radar attribution and Sources
beside the creator credit, with detailed times in Sources and auxiliary solar readouts hidden.
Do not turn the oversized canvas into horizontal page scrolling.

### Explore and reading regions

Keep a fixed viewport with owned scrolling regions; horizontal page overflow is
a failure. At desktop the globe continues behind the floating rail/detail panels.
Explore's initial panel width is 29.5% of the viewport, bounded to 320–480px; saved widths still
take precedence within the existing 264–620px resize bounds. At 900px and above, the visible deck
is inset 24px from the left, 20px below the header and 54px above the bottom. The canvas reserves
the panel width plus 36px for its inset and gap; internal panel padding is 22px. Its header is 72px from 768px wide
and 76px from 1280px wide. The paired Globe/Map control identifies the current projection and
offers the other alongside it. Utility actions stay grouped separately. Folding a
region has an independently reachable restore control and never strands a stored
preference after resizing. Fullscreen expands the window without hiding its tools.

In Explore, Layers and Stories share the existing rail and canvas. Changing tabs never changes
projection, camera, playback or visibility. Scene categories filter Stories without taking the visitor
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
Supplemental inspector disclosures use an 8px gap and retain their 44px controls.

Radar starts on unless a saved choice turns it off. Desktop Explore groups attribution and
Sources & times beside the inline legend. The caption includes the selected UTC scan time when the
rail folds. On phones, Sources & legend holds the legend and source times together, scrolls independently
of the sheet and returns focus on Close or Escape. The projection switch and RainViewer attribution
stay in fixed positions beside it. The full scan date stays available in the inspector. Guided
regional radar remains in the radar inspector, and returning restores the camera and compatible scan time.
Phone keyboard help lives in View options so it does not cover the globe. The author credit stays
at the lower-left viewport edge across home, scenes, Explore and players, outside the moving
canvas and reading regions. It is rendered once by `CreatorCredit` through `GlobeHeader`. Its
left inset is 34px on desktop, 24px below 900px and 18px at 380px or less. The bottom inset is
the greater of 8px and the safe-area inset; its anchor has a 44px target below 900px. The phone
Explore sheet ends above a separate 60px credit band plus the safe-area inset. Its scrollport,
snap positions and navigation share that reservation so controls cannot scroll behind the credit.
Pinned phone detail cards respect the same band, with the selected marker centered in the visible globe strip.
Float Dive keeps its reading allocation above the shared credit reservation.
Background wind paths remain quieter than story paths.

The wordmark stays anchored when entering Explore. Explore, Find, Saved, feed status and View options
have dedicated header controls at every width. Hover and focus strengthen the fill and text without changing
button dimensions. Feed status keeps a fixed slot as its label changes. Privacy and Terms sit beside the
author credit, with location privacy also linked from the device-location control. On narrow phones,
projection sits just beneath the header beside the world. Capture, fullscreen,
rotation and reset share that menu; keyboard help is a quiet optional disclosure. Phone layouts keep
the subject above a draggable, keyboard-operable sheet. Expand globe/map enlarges the canvas; the
other shortcut names the current pane rather than assuming earthquake activity. The handle and
interactive controls have 44px targets. The phone globe row starts at 43% of viewport height, with
a 280px floor bounded by 72% on very short screens. Layers and Stories share that starting height.
A manually adjusted
height takes precedence in either pane. The baseline lower stop is 20%, with a 180px floor
bounded by 60%; its upper stop is 82%. Phone stops subtract the credit reservation, with a
150px minimum globe allocation bounded by 40% on short screens. One shared calculation drives
the sheet, navigation and accessible resize values. Browsing expands the sheet by reducing the globe row;
expanding the globe reduces the sheet. Within that row, the Explore canvas clears the 60px header and safe-area inset
and leaves 12px below, keeping the default globe complete above the sheet.
The drag handle snaps to those three positions; keyboard arrows allow intermediate adjustments and
Home/End reach the extremes. Stored heights are bounded to the current viewport after rotation,
with enough canvas clearance for the header and legend on short screens.
Selection closing and preserved list position remain supported. Check short landscape and tablet
reflow as well as portrait phones.

## Elevation & Depth

Depth comes from the real globe, atmospheric form and tonal layering: void behind deck, raised
within deck, then pale readings. The desktop Explore panel is a flat reading surface. Hairlines,
open rows and restrained corners organize the controls; there is no card-shadow system. Existing
translucent header, detail and rail treatments use restrained blur where they overlay the canvas.
Focus rings and selection brackets are interaction signals, not ambient glows.

**The Quiet Chrome Rule.** Use tonal separation, neutral rules and brightness for hierarchy. Reserve hue for scientific encodings and the bounded globe atmosphere.

## Shapes

The circle of the globe is the dominant silhouette. The primary Explore the globe action uses the field radius;
search fields and featured image crops use the field radius. Projection controls use the projection
radius, ordinary controls and recommendation thumbnails use the control radius, and the projection
pair uses the card radius. Phone recommendations use open ruled rows. Explore and Observatory sheets
use their separate rounded upper-corner roles. Cards remain open reading groups rather than
floating tiles. Active categories use a small filled shape; selected scene diagrams use a quiet
underline. Preserve neutral corner brackets around selected observations.

## Components

### Buttons, fields and reading controls

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

The landing Explore the globe action uses pale ink fill and a directional cue. Browse stories is the secondary action. Utility buttons use
neutral borders and brightness-based hover; inputs remain transparent on the reading deck, with
a visible hairline and square field corners. Compact Explore tabs use an ink underline. The story category strip sits below search, using matching diagrams, labels and selection rules. The shared focus treatment remains visible across each variant.

### Observatory presentation and discovery

A fresh visit leads with the real planet and “Look closer.” Direct content links expose their
content without an introduction in front; existing saved presentation choices retain Explore.
The compact two-line wordmark returns to the invitation. The globe stage carries a UTC readout
and scene-specific reference where space allows. Phone and short-height layouts prioritize the
reachable controls and source disclosure.

The landing’s Browse stories and the header’s Find action open Explore’s single Stories catalogue.
Older catalogue links also resolve there. Its Earth, Below the Surface and After Dark diagrams filter
the collection in a compact strip below search. Selecting the active category again returns to All stories.
The cinematic Earth, depth and sky views open through a scene action shown within the corresponding
category. Those scene views provide a Browse stories action into the same catalogue.
All stories restores the full catalogue. Filtering keeps the query, camera and filter controls in place.
On taller panels, search and categories stay visible above the scrolling results. Switching between Layers
and Stories preserves the chosen layer settings. Layer switches keep the same alignment as status changes.
Coverage and availability details are in the layer inspectors and header feed menu. Location lives in Find a place, and playback
lives within the Storm radar inspector. A recent visit replaces the large feature as the opening
action in the highlights. The full catalogue keeps each entry in its original position so returning
from a story restores the same row and scroll position.

The feature's actual image sits above its title, source, short
promise and Open story action on desktop; on phones it sits beside the reading text. Text has its
own plain reading surface rather than sitting over a feature-image gradient. Initial recommendation
rows keep the title and data type visible while preserving each promise as accessible text; the
full catalogue shows those promises visibly. Unavailable reasons stay visible in either mode.
View all and Saved & recent remain reachable beneath the selection, with From today’s feeds directly
discoverable and guided journeys and archives secondary. Category, search and heading gaps stay compact.

Story thumbnails show recorded captures of their actual views. Float Dive, Rupture Reveal and
Moonfall retain native-resolution crops for the large feature; radar and sky previews are bounded
600px-wide crops. Load these WebP assets lazily and keep capture origin, crop and conversion in
adjacent sidecars. Scientific imagery must come from the app's real rendered content, never generated
data or design-mockup pixels. Guided journeys use quiet rows and each story's reading panel, with
manual steps, visible source context and a return to free exploration. Onward links explain the
relationship without implying shared dates or causation between independent records.

Featured experiences precede a short selection. Saved visits have a direct disclosure; a relevant
Continue action precedes the feature. Story discovery supports focus, hover and touch-hold regional
previews with an explicit Locate action. Timeline milestones use the dataset's actual imagery and
time resolution; synthetic flights say progress. Endings hold the final observation and evidence,
with onward exploration available. Reopening resumes a saved moment; replaying the entrance is explicit.
Closing an experience returns focus to its entry point and restores the drawer's scroll position.

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

Earth traces the day–night boundary from the displayed Sun direction. The sweep settles into
a thin reference line. Reduced motion shows the full boundary immediately. Surface lighting may
use the displayed sun and the sphere's actual normals to improve form. It must not fabricate
topography, add photographic textures, dim earthquake measurements, or alter the flat-map palette.
Presentation crossfades are finite and skipped under reduced motion.

### Shared world layout motion

The landing and Explore reframe the existing canvas without remounting the renderer. A reversible
560ms globe translation/scale uses `cubic-bezier(0.22, 1, 0.36, 1)`; the reading region arrives over
320ms using `cubic-bezier(0.16, 1, 0.3, 1)`. These are composition transitions, separate from the
camera paths inside established stories. Interrupted travel continues from the displayed pose.
Canvas gestures or camera keys, a hidden tab and reduced motion cancel composition travel.
The author credit stays outside both moving regions.

`useWorldLayout` owns the shared layout transition and its cancellation. `usePresentation` owns
presentation state, saved preference and focus; it does not own the canvas animation. Story camera
hooks retain their geographic shots. Panel motion retains readable content and never delays data.

**The Shared World Rule.** Reframe the mounted globe and map; preserve camera control, source subscriptions, story playback and synchronous capture through every presentation change.

### Globe, map and scientific scene

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
use the same rule and an equivalent keyboard selector. Explore adds regional city and storm labels on
the approach, with more city names closer in. Labels share a collision budget on the globe and map.
Radar scans and storm tracks stay in their source coordinates as contrast increases with zoom.
A tap on open geography pins the same location on either projection. The reading shows the closest
available reports within 500 km, with source, distance and time. The city finder offers a keyboard
path to nearby reports. Near a featured city, the place reading links directly to its local sky.
Closing that view restores the map or globe and the pinned reading. Geographic story previews never
steal the camera.

Date comparisons hold one camera and switch actual observations without inventing intermediate images.
Two-place comparisons preserve source definitions, both timestamps and any local datum differences.
Layer focus is temporary and restores the visitor's chosen combination. Regional summaries distinguish
unanswered sources from an empty observed result.

Stars, moon, planets and eclipse geometry follow the displayed time. Constellation
figures are optional interpretation and start off. Layer labels explain their
meaning and limits. Saved preferences take precedence over new-visitor defaults.

### Camera, scene and story motion

Only the Earth landing view has ambient rotation: a slow camera orbit after the entrance
settles, at 2.4 degrees per second with an eased start. Steering pauses it immediately; it resumes
1.5 seconds after the last gesture and its momentum settle. **View options** provides a persistent
auto-rotation setting alongside image capture and fullscreen. Explore,
shared camera views, guided tours and stories keep their own framing. Rotation stops in hidden
tabs and under reduced motion; it does not advance the data clock or continually rewrite the URL.
No perpetual chrome loops. Data appears promptly; fetching never waits for animation.

Fresh visits use an approximate location, rounded to 0.1 degree, at the wide overview zoom in both
globe and map. New York remains the fallback when location is unavailable. Shared links, saved
views and story framing keep their own coordinates; a late estimate never interrupts interaction.
**Use device location** is optional and requests browser permission only after activation.

The landing starts in orbit at overview zoom; the approximate location changes its aim at the
same overview. The close-lens horizon pullback with a settling bank remains available via
**Reset view** and on direct camera links. Navigation retains critically damped springs: long
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
displayed instant. The Earth reference map marks the selected city. Moonfall leaves the chosen sky
through the lunar approach, exposes mapped rover stops and returns to the same sky minute and
bearing or the same Earth map framing. Reduced motion uses the local view immediately.

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

Sun Watch stays inside After Dark. The visitor starts the solar flight or opens one of its chapters.
An archived solar close-up gives way to a schematic wind passage, then clears to the same night-side
globe or map. The wind cursor selects a measured minute independently of the GOES X-ray plot.
Back to the oval restores the forecast edition, camera and projection. Reduced motion opens on
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

Inspecting radar, earthquakes or aurora softens other data layers while the inspector is open.
The original colors, camera, source subscriptions and enabled layers continue through the
change. Leaving the inspector restores the normal contrast.
The Storm radar layer updates only the raster while the viewer steers the shared globe or map.
Its independent scan time remains visible; playback never drives the earthquake timeline.
A covered place with two loaded frames can open **Rewind radar**. The shared camera approaches
the pin with a slight bank and one geographic light sweep over the radar surface. On the map the
same sweep follows the flat projection. Playback appears as the shot settles and stays inside the
place panel. On phones, the scan time and playback controls dock above the credit while
the readings and source details scroll in the sheet. Grabbing the camera ends the reveal immediately.
Reduced motion and shared links open directly to playback. The camera holds its framing while scans change.
A copied link carries the pin, camera, projection and displayed frame. **Back to live** restores
the latest radar at the same place.
The catalogue's Storm Radar view offers authored regional flights and optional NOAA detail.
Provider colors belong to the raster. Region changes reuse the camera flight, and reduced motion
cuts directly to the chosen view. Both entries share the scan player and bounded image loader.

The optional observation views keep one timeline through the existing globe and map morph.
Orbital Pass adds a city horizon, Tide Watch adds a measured gauge, and Wind Atlas traces
its vectors downwind as each forecast step arrives. Satellite imagery and tsunami travel
times stay pinned to geography. Recorded data and model output carry separate labels.
Live observation playback runs when requested. Recorded journeys may open with an authored flight.
Playback stops advancing while the page is hidden.

Tonga opens close to the eruption’s infrared scans and pulls back through the water-vapor
difference scans until the wave fits against the curvature of the shared globe. The bright
ring estimates the leading wave and the fainter ring traces its earlier position. At each
recorded station pulse, a short-lived trace links the site to the measured reading on the same
UTC clock. Ordinary scrubbing holds the camera while chapter and station jumps can reframe
the scene. Reduced motion shows the geographic framing and trace without the authored flight.

Inspecting a station connects its world position to the pale measured-evidence panel. Its trace is
the only active time control while inspecting; the cinematic clock pauses. The reading panel keeps
its actions in view and scrolls longer source details internally. A phone gives the world its own
upper stage and the same evidence panel the lower allocation. Keeping a second station/minute
preserves the first and its note. Shared findings open as a paused recipient view with the measured
value, source and date, then offer the full cinematic story.

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
finishes and releases the frame loop, except the explicitly controlled Earth landing rotation.

Respect reduced motion completely: skip entrance rotation, camera easing and
secondary travel rather than merely shortening them. Keep events and every action
available. Replay, held time, archive mode and the sky share the displayed moment.

### Accessibility

The canvas is hidden from assistive technology; the parallel event list carries
the information and actions. It is a real part of the product. Use roving focus
and recency order, with Enter for details and Escape for closing/unpinning.
Camera controls and timeline bins also work by keyboard.

A polite live region announces genuinely new events above the viewer's threshold,
not the backlog from initial loading. Visible control labels and accessible names
agree. Maintain contrast, focus and 44px phone targets in both ramp modes, all
sheet positions and every folded/loading/error state. Browser scans do not prove
spoken screen-reader output or physical-device usability.

### Honest numbers and source context

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

### Source and zero-cost boundaries

The visualization must render without an account, paid service or API key. Most public
providers are reached directly from the browser. USGS polling and EMSC push/catalogue
readings share a reconciliation policy, while GDACS, EONET and NOAA supply their
respective layers. See [provider coverage](README.md#data-and-attribution).

A small Worker serves static assets and bounded anonymous aggregate analytics;
its feed relay is three fixed GFS and Coral Reef Watch routes cached for an hour.
The relay accepts no parameters and stores no account data or database. The approved location
route returns coordinates rounded to 0.1 degree without storing location or sending location analytics.
Fonts are self-hosted.
Preferences stay on the device and view state stays in the URL. Privacy-aware
analytics must retain its documented allowlist and opt-out boundaries.

Both agencies' readings remain visible. A stable primary reading positions the
marker; it is not a claim that one agency is correct. Never average magnitudes
from different scales or silently turn two accounts into an unquestioned fact.

### Performance and verification

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

The oversized Aperture stage uses viewport scissoring to avoid drawing offscreen fragments;
this clipping does not reduce geometry or configured pixel density. Still and video capture, and
compositor-driven layout travel, render the complete source canvas so hidden-edge pixels remain
available. This is separate from the existing sustained-load frame budget that adapts high-density
drawing while preserving geometry and observation timing.

### Scope and sound

The Aperture invitation uses the live shared globe without registration or a source setup screen. Preserve keyless feeds, sharing, timeline/archive,
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

### Discovery and return visits

The landing stays quiet. The selected scene exposes one featured entry, a compact current-data
discovery list, and returning visitors their recent views. Sources and times explain why a suggestion
is relevant; no new feed or fabricated highlight is required. Saved views are local and removable.
A save confirms what was retained, while unavailable historical live scans explain the fallback.

Video recording lives beside Save image in View options. Its short status sits over the canvas,
leaving playback and navigation reachable. Recording does not introduce a second scene or change
its geometry. The preview appears only after recording ends and can be dismissed immediately.

#### Curated discovery and story continuity

The catalogue introduces the recorded Float Dive investigation, with its source context visible at every width. Its editorial priority does not depend on a recent feed
response. Returning visitors keep Continue in the same place. No feed answer claims that rain
or aurora is visible at the visitor’s location. The editorial catalogue order mixes Earth, ocean
and sky; the complete catalogue and search retain every experience.

A completed story holds a concise finding before onward discovery. Findings distinguish measured
data, modeled fields, predictions and illustration; Float Dive keeps its sample-derived conclusion.
Shared story links explain the saved starting position without covering the visualization. Native
sharing supplies the actual story title and description; cancellation stays quiet and unsupported
sharing retains the copyable-link path.

Same-place data frames retain their geographic arrival and reveal even when source code creates
a new target object. Sustained slow frame pacing can reduce drawing resolution on high-density
displays, with a native-pixel floor and recovery hysteresis. Geometry, textures, observations and
timeline timing stay intact. Reduced motion restores full configured resolution.

## Do's and Don'ts

### Do:

- **Do** keep the real globe as the shared observation surface and preserve geographic camera control.
- **Do** use Alumni Sans for the invitation and selected player headings, Geist for reading, and tabular figures for updating numbers.
- **Do** use the three scene diagrams in the story browser and in Explore’s category strip.
- **Do** separate recorded feature imagery from its source text and preserve capture provenance.
- **Do** keep View all, Saved & recent and From today’s feeds discoverable, with unavailable reasons visible.
- **Do** preserve camera, projection, pane, category, query, scroll and focus when returning from a story.
- **Do** keep the author credit anchored at the lower left across presentations, outside moving and scrolling regions.
- **Do** preserve source distinctions, independent layer times, reduced motion and keyboard access.
- **Do** keep rounded location optional to override; shared views and deliberate camera movement take priority.
- **Do** retain scientific content and marker sizes when the existing frame budget adapts high-density drawing.

### Don't:

- **Don’t** use saturated interface accents, accent glows, pure-black surfaces, serif typography or emoji.
- **Don’t** rotate the globe outside the controlled Earth landing view or introduce perpetual decorative interface motion.
- **Don’t** add photographic Earth textures, decorative cloud layers or night-light overlays to the shared globe.
- **Don’t** use proportional figures in updating numbers, clip names or allow horizontal page overflow.
- **Don’t** hide the product behind loading spinners or blank working layers because another source failed.
- **Don’t** require accounts, API keys or setup before the first useful frame.
- **Don’t** show unexplained bare magnitudes, hide deduplication or misstate coverage and liveness.
- **Don’t** fabricate relationships between observations or lose pinned selections on feed refresh.
- **Don’t** reduce scientific geometry, capture extent or story information to make the Aperture layout cheaper.
- **Don’t** make performance claims without hardware and measurement conditions.

### Float Dive inspection

Float Dive uses the existing shared world for Locate, Rise and Notice. Its bounded ocean
section leaves geographic context visible. Fresh visits start at Locate with a deliberate Follow the rise
action; shared and saved links still open at their measured sample. The finding plots all actual
temperature samples and marks the sample its Keep action stores. Inspection and ordinary scrubbing
continue to save the currently selected sample. Returning restores the source camera, projection,
scroll and focus; a kept observation reopens its measured depth instead of restarting playback.
On return, the waterline folds into the float’s recorded North Atlantic position on the shared world.
The camera takes about 1.5 seconds to restore the previous framing and yields to manual input.
Reduced motion restores that view immediately. The globe and map keep the geographic camera
aim in frame during the unfold.
The measurement inspector opens beside the float;
the selected chart point, instrument reading and playback refer to the same sample. The
playback deck stays reachable independently of the scrolling reading panel. On phones,
the final finding fills the reading surface; opening its measured profile restores the world
and reserves more room for the chart and instrument. Playback follows elapsed time while camera
motion uses bounded integration, so slow rendering does not stretch the measured ascent.
The recorded invitation retains
its source context at every width. Optional notes remain secondary to keeping an observation.
While the profile is open, its sample slider owns inspection and the ascent transport shows a selected
depth readout instead of a second slider. The panel unfolds over 520ms and the finding settles over
420ms; both are finite and skip motion entirely under reduced motion. The phone inspector can grow
to 300px within its canvas allocation and scrolls its own content. Notice brings the finding into
the reading pane without scrolling the shared world or playback.

### Connected discovery and kept evidence

The opening gives the two-line invitation an editorial scale and offers two routes into the shared world.
The catalogue uses recorded imagery and source context to make each investigation tangible.

Find and Saved occupy stable positions in the shared header. On phones they use labelled icon
buttons with full touch targets. Projection and Globe info occupy fixed spots in the world's footer,
clear of the sheet at each stop. Opening the local collection
preserves the current world and search. Its pale evidence cards contrast with the dark observation
deck and carry the selected value, place, time, evidence kind and source. Exported cards exclude notes.

Inspection has one active sample control. The wider Float journey remains visible as context while
the profile inspector owns scrubbing. Evidence unfolds with finite motion; findings settle before
reading and kept cards arrive once. Reduced motion presents the same content immediately.


### Shared cinematic journeys

Recorded observations and Earth stories use one retained playback dock outside the reading scrollport.
It sits over the world on desktop and short landscape layouts, and below the phone reading panel.
Projection uses the shared world-footer component. Float Dive offers it in Locate. During Rise,
the ocean section fills the stage and the globe dims behind it while the depth control stays within
reach. Moonfall offers Skip descent during the approach and shows rover playback on arrival.
Aurora and Sun Watch lead with their own actions and a single contextual return. Local-sky views use
a compass. Controls remain mounted across panel scrolling and resizing.
Scientific explanations and measured section charts sit beside their actions in the reading panel,
leaving the world clear for the actual terrain, section line and lidar curtain. Newly measured sections
reveal their chart within that panel without moving keyboard focus or the globe.
Timeline ticks mark measured or mapped landmarks, while small bookmark marks identify exact kept moments.
Comparison references stay fixed as imagery changes. Projection highlights follow the selected world anchor.
Source replacement preserves the focused logical control and reading position. A failed selection
ends its loading status and leaves the previous data available for manual inspection.

Katrina’s fresh invitation precedes its existing Gulf flight. Iceberg Drift, Seafloor Flight and
Vanishing Sea hold their opening view until the visitor starts playback or chooses a moment.
Saved moments open at the held reading.
Its ending plots the seven published wind readings and distinguishes the offshore maximum from the
Buras landfall. Other completed records retain their subject-specific interpretation on a pale reading
surface, with the source caveats and return action. Findings arrive once and settle without motion
under reduced motion.

Tonight’s Sky leads with a target chosen from the computed above-horizon bodies. Visible targets
precede a secondary below-horizon disclosure. City and night remain available, while Moonfall and
Meteor Nights follow the observing content. Orbit, Map and Local sky use the same city, time and
bearing. The orbit-to-horizon route turns above Earth and pitches into the local sky as it lands.
Reduced motion settles directly into the requested view. Switching back from a shower restores the held sky time
and bearing for the same city. The radar player stays mounted between the layer list and its inspector, preserving the selected scan. The city selector names its curated scope explicitly.
