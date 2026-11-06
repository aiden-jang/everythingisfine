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
| `src/app/ArchiveScene.tsx` | Shared archive dialog, on-demand scene loading and focus |
| `src/app/storm/` | Katrina best track, spherical regional projection and playback |
| `src/app/tonga/` | GOES-17 image crops, estimated Lamb wave and measured ASOS station traces |
| `src/app/kilauea/` | USGS lava chronology, HVO overflight, and historic shoreline comparison |
| `src/app/iceberg/` | On-demand A-68A tracks, dated satellite imagery, and fragment inspection |
| `src/app/megaflash/` | On-demand GOES-16 infrared and time-coded optical flash replay |
| `src/app/useStill.ts` | Synchronous canvas capture, caption, native sharing, download fallback |
| `src/app/stillDelivery.ts` | Attached download links and deferred object URL cleanup |
| `src/app/Utilities.tsx` | Mobile disclosure focus, outside dismissal, Escape and resize lifetime |
| `src/app/useGlobeResources.ts` | Deferred geometry and timezone data, retained while disabled, with completion cleanup |
| `src/app/useObservatory.ts` | First-visit and saved presentation, temporary scene overrides, reduced-motion-aware globe handoff |
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

Tōhoku loads a separate regional canvas and pinned USGS data on request. The model clock orders
fault patches using their rupture start and rise times. ShakeMap contours appear in a separate
surface view. Regenerate the packed asset with [make-tohoku.mjs](tools/make-tohoku.mjs).

Katrina shares the archive dialog and loads its own regional canvas on demand. The frame loop
interpolates the center on the replay clock, while the measurement readout retains the latest
NOAA fix at or before the cursor. Regenerate the packed HURDAT2 track with
[make-katrina.mjs](tools/make-katrina.mjs).

Tonga loads two compressed satellite atlases only when opened. Its replay clock follows scan-start
times, then drives the estimated wavefront and cursor in the observed pressure window. The atlas
metadata records the source keys and the ASOS requests. Regenerate it with
[make-tonga.py](tools/make-tonga.py) using Python with h5py, NumPy, Pillow, and fsspec with HTTP support.

Kīlauea loads a regional map on demand. Dated lava increments accumulate into each snapshot.
The coastline comparison combines the historic coastline with the mapped Fissure 8 delta.
The data generator [make-kilauea.py](tools/make-kilauea.py) uses Python with NumPy, Pillow,
PyProj, PyShp, and Shapely, plus FFmpeg for the HVO excerpt.

Iceberg Drift loads the regional coastline, daily iceberg fixes, and three satellite images
only when opened. The photo cuts hold their source dates. The map joins consecutive fixes and
marks the previous fix when the selected date has no position. Regenerate the bundled tracks
and WebP images with [make-iceberg.mjs](tools/make-iceberg.mjs) using Node and `cwebp`.

Megaflash samples the GLM trace from figure 1 of the published reanalysis, keeping only
colors that match its time scale. A separate ABI scan is reprojected into the same geographic
frame. [make-megaflash.py](tools/make-megaflash.py) regenerates both assets with Python,
PyMuPDF, h5py, NumPy, Pillow, and PyProj.

After Dark reuses the polled NOAA grid for aurora overflight. A flight holds one forecast while
the camera and readout follow it. The frame loop drives the veil sweep and stops when it settles.
Sun Watch opens over that same globe and polls the two NOAA observation endpoints independently
while visible. Each retains its latest reading through failures with a status label and timestamp.
Closing Sun Watch cancels both requests and returns to the stars or starts the aurora flight.

Tonight’s Sky shares the globe renderer and its displayed moment with the Sun, Moon, planets and
star catalogue. The city’s time zone defines the evening and morning across clock changes. The
Moon’s altitude includes parallax at the city. The horizon is level and the twilight glow is
illustrative. The compass holds its direction during scrubbing, and choosing a body points the
camera at its calculated position at that instant.

Storm Radar loads on demand from Live Earth or Explore and shows NOAA MRMS scans on the shared
globe. The scrubber uses published timestamps and requests each raster by its NOAA record ID. The
globe places the raster on a curved patch that uses the same geographic bounds as the image request.
Closing the view aborts requests, releases decoded images and the active texture, and returns to the
originating view.

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
