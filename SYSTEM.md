# Current architecture

Everything Is Fine is a static TypeScript app built with Vite, Preact through React-compatible
imports, Tailwind, and three.js. Most public providers are reached directly from the browser.
The globe needs no API key, account or database. A small Worker
serves static assets, anonymous aggregate events and three fixed regional observation routes.
The observation relay supplies only GFS transport, Coral Reef Watch heat stress and the Florida Keys
temperature pixel. It accepts no parameters, caps responses at 4 MB, coalesces concurrent requests
and caches successes for an hour or provider failures for 30 seconds.

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
| `worker/index.ts` | Static-asset fallback, bounded anonymous analytics ingestion, and fixed observation-route dispatch |
| `worker/observations.ts` and `worker/development.ts` | Three cached read-only NOAA / NSF Unidata subsets, shared by the Worker and local Vite servers |
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
| `src/app/useStill.ts` | Shared caption reader, synchronous image capture and video-recording lifecycle |
| `src/app/capture/` | Bounded local video encoding from the existing renderer, preview and delivery |
| `src/app/visitor/` | Feed-derived discoveries, bounded local visit library and aggregate journey signals |
| `src/app/stillDelivery.ts` | Attached download links and deferred object URL cleanup |
| `src/app/ObservatoryOptions.tsx` | Shared utility popover, capture, fullscreen, rotation and contextual reset |
| `src/app/useGlobeResources.ts` | Deferred geometry and timezone data, retained while disabled, with completion cleanup |
| `src/app/useObservatory.ts`, `observatoryState.ts` | First-visit and saved presentation, temporary scene overrides and story browser state |
| `src/app/usePresentation.ts`, `src/app/useReadingArrival.ts` | Interruptible globe/panel handoff and finite content arrivals without rebuilding the renderer |
| `src/app/useSceneHistory.ts` | In-memory scene, browser-scroll and camera restoration for browser Back/Forward |
| `src/app/float/`, `src/sources/argo.ts`, and `src/globe/floatPresentation.ts` | Argo catalogue and profile validation, sample playback, and the shared globe’s float sequence |
| `src/app/observations/`, `src/sources/observations/`, and `src/globe/observationLayer.ts` | Optional observations and replays, provider readers, shared playback, and projected data layers |
| `src/app/radar/`, `src/sources/{radar,rainviewer}.ts`, and `src/globe/radarSurface.ts` | Storm Radar controls, international/US catalogues, and globe overlay |
| `src/app/{ExplorerSidebar,MapLayers,LayerCatalogue,LayerSources,LayerReadout,WeatherLayer}.tsx`, `useMapLayers.ts`, and `weatherLayers.ts` | Layer/story navigation, independent inspectors, weather clocks, feed health and scene composition |
| `src/app/Observatory.tsx` | Intro, scene choices, captured-story narration and tour controls |
| `src/app/GlobeHeader.tsx` | Shared masthead, capture, source status and explorer tools |
| `src/app/CanvasFooter.tsx`, `MapLegend.tsx` | Explorer credit, input hints and responsive map legend |
| `src/app/journeys.ts` | Filtered reading selection, factual captions and scoped summary |
| `src/app/journeys/` | Manual guided paths, contextual onward links, and navigation through existing story and scene controls |
| `src/app/discovery/` | Regional story previews, filtered nearby reports, and shared discovery styling |
| `src/globe/annotationInput.ts`, `observationAnchors.ts`, and `PlaceLabels.tsx` | DOM annotations projected by the existing camera, bounded label collisions, and explicit Locate/hold/recenter commands |
| `src/app/StoryThumbnail.tsx` and `src/assets/story-previews/` | Lazy recorded-view thumbnails and their origin sidecars |
| `src/app/MeasurementSound.tsx` and `src/app/measurementVoice.ts` | Gesture-enabled measurement tones, bounded playback, and audio cleanup |
| `src/app/useGlobeTour.ts` | Captured route, arrival-aware reading time, pause/step controls and interaction cancellation |
| `src/globe/surfaceMaterial.ts` | Displayed-sun surface shading, fading to the unchanged flat-map palette |
| `src/app/waveReplay.ts` | City selection, regional travel times and replay clock |
| `src/app/sequenceReplay.ts` | Recorded event order, pinned moment and replay clock |
| `src/globe/sequencePresentation.ts` | Unclustered regional replay with magnitude-colored arrivals |
| `src/globe/wavePresentation.ts` | On-demand replay framing, P and S fronts and destination marker |
| `src/globe/nightSurface.ts` | Night, eclipse and aurora surface shader |
| `src/globe/cameraFlight.ts` | Finite arrival path, spring integration and flight-bank targets |
| `src/globe/cameraRig.ts` | Interruptible lens bank and horizon offset, cleared on the map and under reduced motion |
| `src/globe/cameraInput.ts`, `src/globe/cameraGuidance.ts` | Gesture arbitration and manual story-camera ownership, with Recenter at the current timeline position |
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
| `src/app/{layerLink,layerMetadata,layerTime}.ts` | Shared layer state, coverage definitions, source health and consistent UTC labels |
| `src/globe/{overlayPlacement,graphicsRecovery}.ts` | Geographic HUD positioning and recovery of the existing graphics context |
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
`ExploreSheet.tsx` owns its three snap positions,
viewport bounds and tap alternatives; `Resizer.tsx` supplies pointer and keyboard resizing.
Explore's default desktop rail is proportional to the viewport within bounded initial widths;
stored widths still use the existing resize limits. The phone stops bound the canvas row, and its
inner scene clears the header and sheet edge. These layout changes keep the same renderer mounted.
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

The atlas stories extend that shared surface with a GEBCO terrain mesh, a hinged TAO temperature
section, physical Earth-relative orbital distances, and a Moon shaded by the computed terrestrial
shadow. `observationTerrain.ts`, `observationMoon.ts`, and `orbitalFraming.ts` own those bounded layers;
`observationPicking.ts` intercepts map taps only while the depth-section tool is armed. Pointer and
coordinate entry use the same terrain sampling rules. Map projection keeps orbital footprints on
Earth; city mode retains the selected instant and uses topocentric Moon/asteroid positions.

`atlasArchive.ts` resolves local assets as URLs, loads only the selected JSON, and releases failed
requests for retry. Current reef observations and GFS forecasts use fixed cached Worker routes to public NOAA /
NSF Unidata services. A failed current request never silently becomes historical data: the visitor
chooses the dated archive. GFS-to-radar navigation preserves the Pacific region and the forecast
moment for Back, while explicitly switching to recent radar observation time.

`StorySession` retains each story's moment in memory. `storyMoment.ts` validates the URL's story ID,
finite timestamp and bounded choices; individual players clamp times to their data range. Shared
links open paused and never write initial city choices into storage. `StorySearch` searches a small
metadata index across scenes without loading the archives. Returning preserves the query and focus.
Scene navigation stores camera and logical view snapshots in memory; browser history receives only
an opaque entry identifier. Snapshots omit bitmaps and lunar rendering resources. Moonfall restores
its traverse, distance and projection on a fresh lunar scene, and Float Dive restores its paused sample.
The shared-link writer preserves that history state. The title clears story browsing
and returns to the compact Live Earth overview without replaying the entrance or replacing the canvas.
Home leaves the earthquake archive; browser Back can reload the captured archive day. A held moment
within the current earthquake window remains selected across the landing/Explore handoff.
Scene buttons toggle their catalogue; the initial overview has none selected. Explore’s catalogue
entry explicitly opens the all-scenes browser.

The `src/app/journeys/` catalogue provides guided paths and a contextual onward link for each story.
It is separate from `src/app/journeys.ts`, which selects scientific readings for the narrated globe
tour. `StoryNavigation` wraps both presentations, retains the Explore entry context and camera, keeps guided progress in memory and delegates to the existing scene and
story entry points. Steps advance only on request; finishing leaves the current view open for free
exploration. Each view retains its own data, time and controls. Prompts distinguish independent
records, forecasts and predictions rather than implying synchronized time or causation.

The Stories tab opens with one large featured image and three recommendations; Library reveals
the saved, guided, archive and feed sections while preserving their disclosure state. Search and
the full catalogue still route through the same story navigation.

Story thumbnails are cropped captures of the actual rendered views, loaded lazily as WebP assets.
Featured Float Dive, Rupture Reveal and Moonfall crops retain native detail; the radar and sky
previews are downsampled to 600px wide. They remain separate runtime URLs rather than inline data.
Their origin sidecars describe the recorded UI capture; they do not establish current provider
availability or make the preview a live reading. The catalogue adds no backend or persisted route
state; story entry continues to use the existing renderer and on-demand provider lifecycle.

`StoryTimeline` draws milestones from each dataset's actual frames and images. `FrameComparison`
holds camera ownership while selecting two dated frames; synthetic sequence progress and reconstructions
are excluded. `mapFraming` respects authored map targets and regional lenses, otherwise framing the
full route or raster bounds with date-line unwrapping. Pending deck handoffs retain only the prior
geographical framing, never the old measurements under a new story's title.

Layer isolation is derived from saved switches and never writes the temporary selection to storage.
Archive entry clears it. Nearby-place summaries reuse the filtered store and enabled hazard groups;
the earthquake window's clock stays separate from a held cursor. Air monitor picking is opt-in on the
globe and retains the same tap-versus-drag arbitration as the map. Two-place comparisons mount a second
existing source reader only while open, abort it on close, and keep timestamps and local tide datums
explicit. No comparison performs interpolation or introduces another provider or canvas.

`tools/make-earth-stories.py` regenerates the bounded historical archives. Run it in a temporary
Python environment with NumPy, SciPy, Pillow, pyproj, pyshp and ppigrf; Node 22 performs the HTTPS
fetches. Pass one or more of `fault dust comet fire ice north ozone water`, or no arguments for all.
`EIF_ARCHIVE_CACHE` can select a reusable temporary download cache. Inputs and SHA-256 hashes are
recorded in each `*-provenance.json`; raster origins and transformations are reproducible from the
script. The larger fault, fire and ice JSON files load only when their story opens.

`tools/make-atlas-imagery.py`, `make-atlas-orbits.py`, `make-atlas-terrain.py`,
`make-atlas-ocean.py`, and `make-atlas-river.py` regenerate the additional atlas. They share
`atlas_archive.py` and `EIF_ATLAS_CACHE`; use a temporary Python environment with the libraries above
plus rasterio, netcdf4 and h5py. Pass `bloom spring`, `apophis eclipse`, `seafloor glacier`, or
`nino reef aral` to the corresponding generator. The river generator records its dated GFS subset.
`*-sources.json` records input SHA-256 hashes; raster sidecars retain origins and transformations.
No download cache or Python environment belongs in the repository. These are bounded display
subsets: originals remain the authority for scientific analysis.

| Atlas view | Data and interpretation |
| --- | --- |
| Seafloor Flight | GEBCO 2026 regional elevation and source-type grid; measured and inferred bathymetry, 30× lifted relief with unexaggerated depth labels, authored flight rather than an observation timeline |
| Close Encounter | JPL Horizons apparent equator-of-date Apophis ephemeris for 13–14 April 2029; physical distances, enlarged marker, geostationary altitude reference |
| Glacier Flow | NASA ITS_LIVE annual 2013/2024 Greenland velocity mosaics; traces integrate the annual mean field, not observed individual ice parcels |
| Atmospheric River | NOAA GFS humidity/wind integrated from 300 hPa to the surface (at most 1000 hPa), distributed by NSF Unidata; forecast transport and precipitation, not observations |
| Earth’s Shadow | NASA March 2025 eclipse contact catalogue and JPL Sun/Moon ephemerides; computed shadow with illustrative red tint, topocentric horizon boundary |
| El Niño Pulse | NOAA PMEL TAO/TRITON 1997–1998 monthly buoy temperatures; quality-filtered observations with bounded interpolation and visible gaps |
| Ocean Bloom | NASA GIBS Aqua MODIS chlorophyll and matching-date natural color; cloud and swath gaps remain missing |
| Reef Heat | NOAA Coral Reef Watch Degree Heating Weeks plus an offshore SST sample; heat stress risk is not confirmed bleaching |
| Vanishing Sea | JRC Landsat annual surface-water classifications, 1984–2021; reference is observed 1984–1986 water, not the original pre-diversion shoreline |
| Spring Wave | NASA Terra MODIS 16-day NDVI composites, 2023/2024; greenness, not flowers or biomass, and not instantaneous observations |

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
Explicit entry into Tonight’s Sky resets its internal Meteor Nights or Moonfall mode while restoring
the held general-sky city and moment. A shower’s calendar night does not overwrite that saved moment.

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

Float Dive temperature and Tide Watch measured water level offer optional synthesized tones.
`MeasurementSound` creates Web Audio only after a listener’s gesture. `measurementVoice.ts` maps
finite readings into pitch, throttles updates and permits one short, quiet tone at a time. Hidden
tabs, unmounting, and profile or harbor changes close the voice and clear the opt-in. The mapping is
disclosed beside the control; the sound is not a field recording or an ambient loop.

Storm Radar shares its player between the background layer and the Live Earth radar view. RainViewer is the default international
network; NOAA MRMS remains the contiguous-US detail option, including existing US region visits.
The radar toggle defaults on, respects a saved off choice, and mounts the shared scan player on the
landing globe, Live Earth overview and Explore while enabled outside archive mode. The hidden Explore
rail retains that player across the landing/Explore handoff. It contributes to a `map-layers` presentation: no camera target, catalogue hiding or picking
override. The catalogue retains the cinematic `radar` presentation and regional controls. The two
entries never mount their scan loaders together; leaving either releases decoded images and requests.
Both use the shared globe/map and preserve the selected provider timestamp during playback. The guided entry receives the layer scan; closing it restores the Explore camera and copies back only a compatible RainViewer timestamp.
The background feed panel includes RainViewer while the shared layer is active, using the same loader's
catalogue and latest-image health without another request. Off radar remains listed outside the count.
Empty results, delayed scans and missing imagery have distinct messages; failed refreshes retain the
last successful check time.
Surface wind and lightning are optional additions through the same layer controls. They reuse the
GFS surface forecast and GOES-East GLM readers, lazy-load when enabled on the landing globe or in Explore,
and cancel requests when disabled or entering another scene. Radar keeps one mounted player beneath its
catalogue row, compact in the overview and expanded in
its inspector. Other inspectors expose their players while preserving the other layers' selections
and independent timestamps. Selected times live above the players so a scene
detour, archive visit or disabled layer releases data resources without losing the chosen moment.
Returning reopens paused; following latest remains distinct from holding a timestamp. An expired
selection reports its fallback rather than silently presenting it as the same scan.
The URL carries the enabled layer set and held weather times independently of device preferences.
Shared coverage metadata drives the layer list and per-layer source disclosure. Event sources remain checked when their
markers are hidden; optional weather sources leave the feed total when off. Live weather retries on
reconnection, retaining existing data with its original time while recovery is pending.
The shared readout names wind forecasts and GOES-East lightning with their own timestamps on landing,
globe and map. Explore groups source times, radar attribution and legend at the canvas edge, with
author credit and keyboard help secondary. Sources & times uses a native popover at every width for radar, wind
and lightning details; Close and Escape restore trigger focus, and radar attribution stays visible.
Their frames contribute paths and marks to
the existing observation renderer, with stable geometry references and no additional canvas.
The feed total includes each enabled source, reports failure independently, and retains its last
successful check. Archived earthquakes and cinematic views do not mount current weather sources.
Landing composition retains its day/night lighting and automatic rotation while sharing these overlays.
Base-layer visibility choices also apply in the scene categories; explicit stories own their separate
source data. Guided depth stops pause background weather until the surface view returns.
RainViewer’s past-only catalogue supplies up to two hours of ten-minute composites. Each frame combines
four zoom-one 512-pixel tiles into a bounded overview, using the supported Universal Blue palette.
Mercator latitude is mapped onto the globe’s geographic mesh; NOAA retains its geographic raster bounds.
A separately sourced coverage mask marks unobserved areas with subtle stripes. All four radar and
coverage tiles must succeed before a frame is displayed; missing tiles never masquerade as dry weather.
The UI identifies composite time, variable radar age, approximate coverage and polar limits, and links
the required RainViewer attribution. GOES-East lightning remains in the US detail mode.

A bounded in-memory blob cache reuses tiles across view changes. A sliding request budget stays below
RainViewer’s per-IP ceiling, including retries; waits abort on exit and hidden-page requests stop.
The catalogue refreshes every two minutes, decoded frames are limited to the active time window plus
a held selection, and no forecast or discontinued satellite endpoint is requested. Closing the view
aborts requests, releases decoded images and the active texture, and returns to the originating view.

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
