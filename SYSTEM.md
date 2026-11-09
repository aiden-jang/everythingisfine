# Current architecture

Everything Is Fine is a static TypeScript app built with Vite, Preact through React-compatible
imports, Tailwind, and three.js. Public providers are reached directly from the browser.
The globe needs no API key, account, database or server-side feed cache. A small Worker
serves the anonymous aggregate-events endpoint alongside static assets; it does not proxy feeds.

## Data flow

1. `src/sources` adapts USGS polling, the EMSC socket and catalogue, GDACS hazards, EONET history,
   and NOAA aurora into typed readings. Fixtures settle parsing; live tests check provider contracts.
2. `src/data/store.ts` bounds retained events and revisions. `src/data/reconcile.ts` associates
   accounts from different agencies while preserving their published magnitude and scale.
3. `src/app/feed.ts` owns source lifecycle, coverage, retention, and switching between live and archive.
4. `src/App.tsx` composes the view, filters, selected event, timeline, and shared URL.
   It passes data and callbacks into the observatory, rail, detail sheet, and globe.
5. `src/globe/scene.ts` owns WebGL resources and scene layers. `src/globe/controls.ts` owns geographic
   camera movement and picking. `src/globe/Globe.tsx` bridges the scene and app, redrawing only while
   motion or changed data requires it.

## Reconciliation

`src/data/reconcile.ts` associates different agencies' readings when origin times
are within 30 seconds, epicentres within 150 km and finite magnitudes within 1.0.
A missing magnitude does not prevent association. Within one agency, an identical
provider ID identifies a revision rather than a second event.

These thresholds express a matching policy, not proof of physical identity. Nearby
ruptures can still be confused. Preserve each agency's original magnitude, scale,
location and time; never average them. USGS supplies the primary marker when both
are available so arrival order does not move it. The detail panel exposes both
accounts and the rail distinguishes raw readings from distinct events.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `worker/index.ts` | Static-asset fallback and bounded anonymous analytics ingestion |
| `analytics/` | Closed event schema, privacy-aware browser transport and aggregate dataset writes |
| `src/app/useArchive.ts` | Archive request ownership, stale-response protection, date navigation, source coverage |
| `src/app/ArchiveControls.tsx` | Date entry, calendar, notable days, and eclipse controls |
| `src/app/useEclipsePlayback.ts` | Eclipse replay clock, scrubbing and interruption |
| `src/geo/aprilEclipse.ts` | Interpolation of NASA’s April 2024 path samples |
| `src/app/rupture/` | On-demand Tōhoku archive scene, regional projection and finite reveal clock |
| `src/app/observations/RecordedReplay.tsx` | Shared replay controls, projection, source credits, and on-demand loading |
| `src/app/storm/` | Katrina best track, projected quadrant radii and camera playback |
| `src/app/tonga/` | GOES-17 image crops, estimated Lamb wave and measured ASOS station traces |
| `src/app/kilauea/` | USGS lava chronology, HVO overflight, and historic shoreline comparison |
| `src/app/iceberg/` | On-demand A-68A tracks, dated satellite imagery, and fragment inspection |
| `src/app/megaflash/` | On-demand GOES-16 infrared and time-coded optical flash replay |
| `src/app/useStill.ts` | Synchronous canvas capture, caption, native sharing, download fallback |
| `src/app/stillDelivery.ts` | Attached download links and deferred object URL cleanup |
| `src/app/Utilities.tsx` | Mobile disclosure focus, outside dismissal, Escape and resize lifetime |
| `src/app/useGlobeResources.ts` | Deferred geometry and timezone data, retained while disabled, with completion cleanup |
| `src/app/useObservatory.ts` | First-visit and saved presentation, temporary scene overrides, reduced-motion-aware globe handoff |
| `src/app/float/`, `src/sources/argo.ts`, and `src/globe/floatPresentation.ts` | Argo catalogue and profile validation, sample playback, and the shared globe’s float sequence |
| `src/app/observations/`, `src/sources/observations/`, and `src/globe/observationLayer.ts` | Optional observations and replays, provider readers, shared playback, and projected data layers |
| `src/app/radar/`, `src/sources/radar.ts`, and `src/globe/radarSurface.ts` | Storm Radar controls, NOAA scan catalogue, and globe overlay |
| `src/app/Observatory.tsx` | Intro, scene choices, captured-story narration and tour controls |
| `src/app/GlobeHeader.tsx` | Shared masthead, capture, source status and explorer tools |
| `src/app/CanvasFooter.tsx` | Explorer credit and input hints |
| `src/app/journeys.ts` | Filtered reading selection, factual captions and scoped summary |
| `src/app/useGlobeTour.ts` | Captured route, arrival-aware reading time, pause/step controls and interaction cancellation |
| `src/globe/surfaceMaterial.ts` | Displayed-sun surface shading, fading to the unchanged flat-map palette |
| `src/app/waveReplay.ts` | City selection, regional travel times and replay clock |
| `src/app/sequenceReplay.ts` | Recorded event order, pinned moment and replay clock |
| `src/globe/sequencePresentation.ts` | Unclustered regional replay with magnitude-colored arrivals |
| `src/globe/wavePresentation.ts` | On-demand replay framing, P and S fronts and destination marker |
| `src/globe/nightSurface.ts` | Night, eclipse and aurora surface shader |
| `src/globe/cameraFlight.ts` | Finite arrival path, spring integration and flight-bank targets |
| `src/globe/cameraRig.ts` | Interruptible lens bank and horizon offset, cleared on the map and under reduced motion |
| `src/globe/cameraTarget.ts` | Shared camera callback, perspective panel lift and explicit arrival replay |
| `src/app/sun/` | On-demand solar flight, separate live observation windows and feed state |
| `src/sources/spaceWeather.ts` | NOAA primary wind and GOES X-ray decoders |
| `src/globe/planetarium.ts` | Finite After Dark pitch, input interruption and reduced-motion sky framing |
| `src/app/tonight/`, `src/geo/tonight.ts`, and `src/globe/localSkyCamera.ts` | Tonight’s Sky controls, local night window, and city-to-horizon camera |
| `src/sources/auroraRoute.ts` | Current NOAA forecast checks and dark-side oval selection |
| `src/globe/auroraFlight.ts` and `src/globe/auroraVeil.ts` | Finite polar framing and forecast-derived ribbon |
| `src/globe/depthDive.ts` | Oblique cutaway framing after geographic arrival, including interruption and exit |
| `src/globe/cameraProjection.ts` | Geographic projection for overlays and limb-safe perspective angles for input |
| `src/globe/morph.ts` | Reversible sheet geometry, shared geographic projection, and map repeat spacing |
| `src/globe/sectionDrawing.ts` | Map drag capture and projected hinge endpoints |
| `src/app/useSectionFold.ts` | Finite fold from the map hinge to the settled depth chart |
| `src/globe/useGlobeLayers.ts` | Layer and presentation updates through stable refs, waking the existing renderer |
| `src/globe/starExposure.ts` | Bounded photographic trails from consecutive rendered camera matrices |
| `src/globe/surfaceLayers.ts` | Atmosphere, ocean glint and finite reveal exposure |
| `src/globe/framing.ts` | Shared camera latitude and zoom bounds |
| `src/app/useHazardLayers.ts` | Live hazard loading and answered state |
| `src/app/useStored.ts` | Remember preferences only when the visitor changes them |
| `src/app/CopyLink.tsx` | Pinned-event link copying and recovery when clipboard access is refused |
| `src/app/viewLocation.ts` | Publish same-document URL changes and subscribe copy controls to the current address |
| `src/app/permalink.ts` | Parse and encode a shareable view without persisting playback motion |
| `src/globe/animation.ts` | Bound long pauses while retaining elapsed time on slow displays |

The main component and scene modules still coordinate several features. Their existing size
exceptions are ratcheted down as cohesive responsibilities move out; they are not invitations
to grow them. New modules stay under the normal size and state ceilings.

## Lifetime and timing

A feed's unanswered state differs from an empty result. Live source startup precedes an archive
from a shared URL. Only the newest archive request may update the view; leaving the archive or
unmounting invalidates pending answers. A failed request clears loading and provides retry guidance.
Source restarts invalidate older seed/poll answers even when a transport ignores cancellation.
EMSC constructor refusals enter the normal reconnect path; failed sockets close before retrying.

Preferences write in their setters, never on initial mount. A shared link can override the initial
view without turning defaults into stored choices. The sheet height uses the same preference path.
Restoration validates named choices and finite numbers before they reach rendering or layout.
Resize cancellation, lost window focus and unmount release the drag's page styles.
The application has a persistent heading and main landmark. Panels have distinct names;
action descriptions supplement visible button names instead of replacing them.

Camera springs integrate fixed slices for stability. The frame loop accepts slow-display elapsed
time up to a bounded pause, keeping movement from stretching with software-rendered frames.
Replay retains wall-clock time. Reduced motion remains a separate user preference.

Tōhoku, Katrina, Tonga, and Megaflash load on demand and publish geographic layers to the
shared observation renderer. Globe and Map use one playback clock and the same geographic data.
The replay shell owns projection controls and restores focus to the drawer, archive, or pinned event.

The Earth stories in `src/app/earth-stories/` use the same observation layer, camera controls,
projection transition, and requestAnimationFrame loop. No story creates another renderer. The
radar wipe is a finite texture reveal; the CALIPSO curtain uses measured browse coordinates and
labelled vertical exaggeration. Reduced motion settles both immediately. Interaction interrupts
camera following, hidden tabs pause playback, and pending images hold the prior matching timestamp.

`StorySession` retains each story's moment in memory. `storyMoment.ts` validates the URL's story ID,
finite timestamp and bounded choices; individual players clamp times to their data range. Shared
links open paused and never write initial city choices into storage. `StorySearch` searches a small
metadata index across scenes without loading the archives. Returning preserves the query and focus.

`tools/make-earth-stories.py` regenerates the bounded historical archives. Run it in a temporary
Python environment with NumPy, SciPy, Pillow, pyproj, pyshp and ppigrf; Node 22 performs the HTTPS
fetches. Pass one or more of `fault dust comet fire ice north ozone water`, or no arguments for all.
`EIF_ARCHIVE_CACHE` can select a reusable temporary download cache. Inputs and SHA-256 hashes are
recorded in each `*-provenance.json`; raster origins and transformations are reproducible from the
script. The larger fault, fire and ice JSON files load only when their story opens.

| Archive | Source and interpretation |
| --- | --- |
| Ridgecrest | USGS field surveys, NASA ARIA/JAXA ALOS-2 wrapped phase; local offsets and combined line-of-sight motion are separate quantities |
| Dust | NASA GIBS AIRS daily dust score, CALIPSO V5.00 532 nm browse backscatter; no inferred dust concentration |
| NEOWISE | NASA/JPL Horizons hourly geocentric directions and distance, transformed into the saved city's sky |
| Dixie region | NASA FIRMS 2021 Suomi-NPP VIIRS nominal/high-confidence vegetation detections, grouped by pass; not a reconstructed fire perimeter |
| Sea ice | NOAA/NSIDC Sea Ice Index v4 daily extent and same-date 1981–2010 median outlines |
| Magnetic north | NOAA annual dip-pole positions and IGRF-14 sea-level city declination; model, not local compass survey |
| Ozone | NASA GIBS Aura OMI total-column ozone and Ozone Watch area estimates for 2006/2019 |
| Water | NASA GIBS/JPL GRACE RL06 V2 mascons and land-cell means in labelled regional boxes, relative to 2004–2009 |

Tōhoku orders fault patches by their USGS rupture start and rise times. A depth cutaway accompanies
the modeled slip, then ShakeMap contours appear on the shared surface. Recorded waves animate the
station marks while the traces and optional audio stay in the readings panel. Regenerate the packed
asset with [make-tohoku.mjs](tools/make-tohoku.mjs).

Katrina’s camera follows the interpolated center. The track and wind radii stay registered to Earth,
while the readout retains the latest NOAA fix at or before the cursor. Regenerate the packed
HURDAT2 track with [make-katrina.mjs](tools/make-katrina.mjs).

Tonga crossfades two compressed satellite atlases into the shared globe and map. Its replay clock
follows scan-start times, then drives the estimated wavefront and cursor in the observed pressure
window. The atlas metadata records the source keys and ASOS requests. Regenerate it with
[make-tonga.py](tools/make-tonga.py) using Python with h5py, NumPy, Pillow, and fsspec with HTTP support.

Kīlauea draws the survey and coastline comparison onto one geographically anchored texture in the
shared globe and map. The regional camera magnifies that surface after arrival. Dated lava increments
accumulate into each snapshot. The HVO footage is a separate layer in the same story.
The data generator [make-kilauea.py](tools/make-kilauea.py) uses Python with NumPy, Pillow,
PyProj, PyShp, and Shapely, plus FFmpeg for the HVO excerpt.

Iceberg Drift loads daily iceberg fixes and three dated satellite images on demand. The shared
globe and map join consecutive fixes and report the last recorded date when the selected date has no
position. The photo layer can be opened on its source date. Regenerate the bundled tracks
and WebP images with [make-iceberg.mjs](tools/make-iceberg.mjs) using Node and `cwebp`.

Megaflash samples the GLM trace from figure 1 of the published reanalysis, keeping only
colors that match its time scale. A separate ABI scan is reprojected into the same geographic
frame as the shared surface. [make-megaflash.py](tools/make-megaflash.py) regenerates both assets with Python,
PyMuPDF, h5py, NumPy, Pillow, and PyProj.

After Dark reuses the polled NOAA grid for aurora overflight. A flight holds one forecast while
the camera and readout follow it. The frame loop drives the veil sweep and stops when it settles.
Sun Watch opens over that same globe and polls the two NOAA observation endpoints independently
while visible. Each retains its latest reading through failures with a status label and timestamp.
Closing Sun Watch cancels both requests and returns to the stars or starts the aurora flight.

Lights Return opens from After Dark and flies the existing globe toward Puerto Rico at local midnight
before landfall. The archive takes over from the island’s projected size. Four matching NASA Black
Marble HD stills are loaded only on entry. The four source images use the same crop and original
color ramp. The three recovery frames average their labeled date ranges. A clipping divider keeps
both views registered to the original framing. Playback advances only among those four frames.

Shadow Chase reuses the globe, map and local horizon. The globe follows NASA’s WGS84 centerline samples
and draws the northern and southern limits. The moving shadow and local Sun–Moon geometry use the
Besselian elements from the same NASA map. The city view estimates visibility and contacts at sea
level against a geometric horizon. The Luxor preview leaves the saved After Dark city intact.

Tonight’s Sky shares the globe renderer and its displayed moment with the Sun, Moon, planets and
star catalogue. The city’s time zone defines the evening and morning across clock changes. The
Moon’s altitude includes parallax at the city. The horizon is level and the twilight glow is
illustrative. The compass holds its direction during scrubbing, and choosing a body points the
camera at its calculated position at that instant.

Moonfall lazily loads the lunar mosaic, a local elevation grid and orthomosaic, and the three Apollo 17
traverses. The Moon and valley use dedicated perspective and landing-map cameras in the existing renderer. Its finite
approach and descent are illustrative. The terrain uses the LRO survey at about 64 m per sample and
keeps the traverse segments and geology stops in the survey’s transverse Mercator grid. The rover
cursor follows cumulative mapped distance and leaves gaps in the source geometry open. Closing
Moonfall disposes its GPU resources and restores the original local sky view. The source URLs and
conversion parameters are in [make-moonfall.py](tools/make-moonfall.py).

After Dark, Tonight’s Sky, Meteor Nights and Orbital Pass share a saved city. Meteor Nights uses dated peak
nights and radiants from the 2026 and 2027 IMO calendars. Local sidereal time places the radiant,
and five-minute samples find windows with astronomical darkness, the Moon below the horizon and
the radiant at least ten degrees above it. The sky renderer projects the calculated path above the horizon.

Million-Mile View opens on 20 source photographs from the July 2015 DSCOVR lunar transit,
resized to WebP. The latest option reads NASA EPIC metadata and loads only the selected photograph.
The photo overlay leaves the shared canvas mounted. Deep Time loads simplified EarthByte Müller
2019 coastlines and three reference tracks at ten-million-year steps from the present to 230 Ma.
Custom coordinates use GPlates plate assignment and motion paths at the same step while the assigned
plate has model coverage.

Swell Lines requests a bounded North Pacific sample of NOAA GFS-Wave through Open-Meteo when
opened. The selected Scripps CDIP buoy supplies a separate measured wave height and peak period.
The view compares observations only with a nearby model hour and labels unavailable readings.

The Tōhoku recorded-waves chapter uses seven EarthScope vertical broadband traces at 1 Hz for
the first 90 minutes after the event. The plots preserve five-second minimum and maximum envelopes
and normalize each instrument independently. The onset markers use sustained motion above the
preceding baseline. Optional audio resamples each recording at 900 times its original rate.

Float Dive loads on demand from Live Earth. The browser requests ascending North Atlantic
profiles from the Marine Institute ERDDAP and validates each level’s pressure, temperature and
salinity quality flags. Two bundled recordings from the same source stay available offline.
The instrument is schematic and the ascent is compressed. The readout uses the original
samples, with depth estimated from pressure using the
[Fofonoff and Millard equation](https://doi.org/10.25607/OBP-1450).

Storm Radar loads on demand from Live Earth or Explore and shows NOAA MRMS scans on the shared
globe. The scrubber uses published timestamps and requests each raster by its NOAA record ID. The
globe places the raster on a curved patch that uses the same geographic bounds as the image request.
Closing the view aborts requests, releases decoded images and the active texture, and returns to the
originating view.

Optional Observatory views load provider code and data on demand. Timeline samples stay attached
to the same WebGL scene through both projections. Real measurements, forecasts, and archived
imagery retain their timestamps and source labels. Live requests can keep their previous result
on a failed refresh. The header shows the background sources separately and tracks when this
browser last heard from each one.

WebGL startup failures have a retry surface; they do not remove the event list and filters.
Scene callbacks use current refs so changing a selection does not recreate WebGL resources.
The still exporter copies the drawing buffer before the browser composites it.
Sharing starts in the same click. A refused sheet retains its file behind an explicit download
action; cancellation does not create a download. Capability probing and capture failures stay recoverable.
Shared controls update the URL before paint; moving playback keeps its periodic URL cadence.

## Validation

The supported tooling runtime is pinned to Node 22, matching CI and the performance-gate calibration.
`pnpm run verify` mirrors CI. Unit tests cover pure behavior, source contracts, retention, and
performance. Browser fixtures cover actual WebGL, CSS, accessibility states, camera movement,
sharing, and responsive layouts. Release journeys and development-only instrumentation run on
separate origins. Daily live checks are informational and separate from merge checks.

[DEPLOY.md](DEPLOY.md) describes CI and release behavior. [DESIGN.md](DESIGN.md) owns visual rules.
[ARCHITECTURE.md](ARCHITECTURE.md) indexes non-obvious constraints referenced by source and tests.
