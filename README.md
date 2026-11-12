# Everything Is Fine

An interactive globe for live earthquakes, storms, volcanoes, wildfires, floods, and aurora.
Explore a region, compare two agencies' earthquake readings, revisit a past day, or share a view.

[Open the app](https://everythingisfine.aidenjang.com) ·
[Architecture](SYSTEM.md) · [Contributing](CONTRIBUTING.md) · [Deployment](DEPLOY.md)

![Everything Is Fine globe](public/share.png)

## Run locally

Use Node.js 22 (22.22.2 or newer within that major) and pnpm 9.15.0. The package-manager version is pinned in
`package.json`; `.nvmrc` selects the Node version used by CI. With nvm installed, run `nvm use`
before installing dependencies. No API keys, accounts, environment file, or backend are needed to run the app.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Open <http://localhost:31600>. Fonts and map geometry are bundled. Most feeds load directly in
the browser; GFS and Coral Reef Watch use fixed cached same-origin routes because their providers
do not support browser CORS. The local server supplies the same routes without a key or account.

## Observe and explore

A fresh visit opens a compact introduction beside the shared globe, with no scene selected.
Choosing Live Earth, Below the Surface or After Dark opens its content immediately; choosing the
selected scene again collapses the catalogue and returns to the introduction.
**Explore** opens the scientific controls. The wordmark returns to the Live Earth landing view. Browser Back restores the previous view. Choose **Reset view** in Explore to clear the selection, filters, and held time and replay the globe’s arrival.
Existing saved layouts and links to an event, archive, section, or held moment open the explorer directly.
**Save image** adds the displayed story’s title, time and source to supported canvas views.
Photograph overlays and Sun Watch do not offer an incomplete canvas-only export.
Use **Fullscreen** on desktop for a larger viewing area.
Each scene contains tours, featured experiences, live observations, forecasts, predictions, and
replays. Explore also offers a direct entry to the full catalogue. **View options** holds image and clip capture, fullscreen and the landing globe’s
auto-rotation setting. Dragging pauses rotation; it resumes after 1.5 idle seconds.
Search by subject, place, or year across all three scenes. The thumbnails are recorded views;
open a story for its source, date, and current availability. Closing a story returns to its search
result or drawer entry. **Keep exploring** offers a related view with context for its separate
observations and time period. **Share this moment** copies the story, timestamp, projection, and selected
city or chapter. Links open paused; recent feeds explain when the linked observation has expired.

Each scene has a featured starting point: Float Dive, Rupture Reveal, or Moonfall.
**Worth looking at today** uses the current earthquake reports, available NOAA aurora forecast,
and calculated sky above the selected city. Dates and sources stay attached; unavailable or expired
readings are not advertised as current.

Recent visits appear under **Pick up where you left off**. **Save view** keeps one bookmark per story
on this device; **Update saved view** replaces its saved point. Recorded stories retain their held time and projection; Moonfall retains its traverse,
Tonight’s Sky its city and time, and Float Dive its measured depth. Live views reload their providers;
a radar scan may expire and a recent float profile may become unavailable. **Saved views** lets you
remove bookmarks or clear recent visits. No account or remote storage is involved.

**Record 10-second clip** records the existing canvas as a silent video with its source and date.
Start recording, then replay or scrub within the view. Stop early or cancel, preview the result, then
download it or use native sharing where supported. The recorder uses a bounded 720px output without
reducing the displayed globe’s detail. Leaving the tab or changing views cancels it. Video support
varies by browser; Save image remains the fallback. Recordings stay in browser memory until dismissed.

The drawer also offers **One night above Earth**, **Water in motion**, and **Reading the coast**.
These guided journeys provide a reading prompt and source context in each view. Advance with **Next**,
revisit a **Previous view**, or leave the journey to explore freely. Progress is temporary;
each view keeps its own controls and time. The sequence does not imply synchronized readings
or a causal connection between separate events.

In **Float Dive** and **Tide Watch**, choose **Listen to temperature** or **Listen to water level**
to hear short synthesized tones as the measured reading changes. Higher pitch means warmer water
or a higher measured level within the displayed range. Sound starts off and returns to off when
the tab is hidden, the view closes, or the selected profile or harbor changes. These are sonified
measurements, not field recordings.

- **Live Earth** frames current activity and traces the day–night boundary. Choosing it from an
  archive returns to live.
- **Below the Surface** flies to the deepest visible earthquake, settles at an angle, and opens
  a cutaway with true-scale reference guides and historical seismicity. It is available when the
  view contains a reported depth of at least 70 km.
- **After Dark** opens the displayed moment's night sky above Earth's curved horizon, then traces
  constellation guides. Reduced motion keeps the same view without the flight.
- **Lights Return** leaves the After Dark sky for Puerto Rico and follows the return of nighttime
  lights after Hurricane Maria. Play or scrub four NASA Black Marble HD views from the pre-storm
  baseline through March 2018. Compare a recovery period with the baseline using a fixed divider.
- **Shadow Chase** follows NASA’s predicted path for the 2 August 2027 total solar eclipse. Scrub
  the same shadow on the globe or map, then see the predicted eclipse from your saved After Dark city or preview
  totality in Luxor.
- **Tonight’s Sky** descends to a selected city from After Dark. Scrub from local sunset to sunrise,
  use the compass to turn, or point at the Moon and five bright planets. Angles are calculated for a
  level horizon. Where a crossing is absent, the timeline uses a local evening or morning endpoint.
- **Moonfall** is featured in the After Dark drawer and also opens from Tonight’s Sky. Fly from lunar orbit into
  Taurus–Littrow and switch between Terrain and Landing map without resetting the rover traverse
  or geology stop. Back returns to the opening screen, sky view, or drawer that opened it.
- **Meteor Nights** traces a shower’s apparent origin across the same local sky. Play or scrub a
  listed peak night and find the dark, moon-free windows. The city selected in After Dark is shared
  by Tonight’s Sky, Meteor Nights, Orbital Pass and Shadow Chase. Returning to Tonight’s Sky through
  **Keep exploring** restores its held night and city; a shower’s peak date does not replace that night.
- **Follow the aurora** in After Dark banks over a dark-side NOAA OVATION forecast oval and settles
  into a polar view. The readout shows the forecast time and modeled chance at the focus. The
  raised glow illustrates the footprint. Reduced motion opens the polar view directly.
- **Float Dive** follows an Argo float from its North Atlantic position into a schematic ascent on the globe.
  Play or scrub measured temperature and practical salinity from depth toward the surface.
  Pick a recent Marine Institute profile or a bundled recording.
- **Storm radar** is an independent Explore layer with playback, stepping and a scan-time slider.
  It preserves the current camera and other layers. The catalogue's **Storm Radar** view adds regional
  framing and optional NOAA United States detail. Coverage notes explain the sources and their limits.
- **Million-Mile View** pulls the globe back into NASA’s DSCOVR camera view. Scrub the recorded
  2015 Moon crossing or switch to the latest published full-Earth photographs.
- **Deep Time** replaces modern coastlines with reconstructed continents. Rewind to Pangaea on
  the globe or map and pin a present-day place to follow its plate.
- **Swell Lines** follows forecast swell direction and height across the Pacific. Scrub two days
  of forecasts and select a buoy to compare recent measurements with the nearby model.
- **Orbital Pass** opens from After Dark’s drawer with a city picker, a local horizon, and
  Globe and Map views of the predicted ground track.
- **Feed status** lists the seven background feeds and their last successful check or received message.
  Observatory views fetch their own sources when opened. In Storm Radar, switch projections or turn
  on matched GOES-East lightning scans.
- **Fault Offset** traces Ridgecrest’s two 2019 surface ruptures, opens surveyed offsets, and wipes
  NASA’s combined radar observation across the same terrain.
- **Dust Curtain** follows June 2020 AIRS observations across the Atlantic. Open the measured
  CALIPSO lidar slice above its ground track; the exaggerated height is labelled.
- **Comet Return** follows NASA/JPL NEOWISE positions in July 2020 and opens a visible hour above
  the selected After Dark city. The marker represents direction, not a near-Earth orbit.
- **Fire Front**, **Ice Line**, **Wandering North**, **Ozone Season**, and **Water Weight** replay
  satellite fire detections, Arctic sea ice, magnetic-pole motion, Antarctic ozone, and California
  water storage. Each keeps its dated measurements when switching between globe and map.
- **Take a tour** visits a captured selection of readings and regions. Narration waits for arrival;
  Pause, Previous, Next, Stop, and Read this event remain available. Hidden tabs pause its reading time.
- **Pick a past date** in the drawer opens the UTC date picker in Explore.
- **Sun Watch** in After Dark moves from a NASA solar image through a schematic solar-wind
  stream and back to Earth. Its two live plots show the last hour of upstream wind speed and
  six hours of GOES X-ray flux. Choose any of the three still views with reduced motion.
- **Globe** and **Map** switch projections during Tōhoku, Katrina, Tonga, and Megaflash.
  The story keeps its playback time and selected chapter.
- **Watch Tōhoku rupture** follows the 2011 earthquake from its epicenter to the modeled fault
  beneath the ocean and then to estimated shaking across Japan. Choose **Fault movement** or
  **Surface shaking** to inspect either view. **Recorded waves** shows the stations on Earth and compares their traces on a
  shared timeline and offers optional sonification. Reduced motion opens the finished fault view.
- **Follow Hurricane Katrina** banks over the Gulf and follows NOAA’s 2005 best track to landfall
  near Buras, Louisiana. Pause, scrub, or jump to the offshore peak and landfall. Reduced motion
  opens a fixed overview with the same readings.
- **Watch Tonga’s shockwave** opens on infrared and water-vapor scans of the 2022 eruption,
  then pulls back to follow the estimated atmospheric wave. Pick a ground station to jump to
  its pressure pulse. Reduced motion opens the eruption scan with the same timeline and stations.
- **Follow Kīlauea’s lava** flies to Hawaiʻi and follows the 2018 flow from Fissure 8 to Kapoho Bay.
  Scrub dated USGS maps, compare the former shore with the August 9 footprint on either projection,
  or open the HVO footage at the ocean-entry chapter.
- **Iceberg Drift** follows A-68A and its 13 recorded fragments on the globe and map. Choose an
  iceberg to jump to its last listed position, or open a satellite image at one of three chapters.
- **Watch Megaflash** slows down a 2017 lightning flash from the southern Plains. Follow the
  GOES-16 optical trace, then pull back to see the span across five states. Reduced motion
  opens the full trace with the same scrubber.
- **Save image** uses the existing captioned image export, including the reference-cutaway label.

The opening pulls back from the horizon into orbit. Long camera flights bank gently, bright stars
leave short photographic trails during travel, and scene reveals briefly lift the atmosphere's light.
Constellation guides trace with a leading glint; cutaway reference rings draw in sequence. Headline
words arrive with a staggered reveal. These are finite presentation effects; reduced motion skips them.

Scenes are temporary: returning to Explore restores the saved layer and projection choices. Choosing
Observe or Explore remembers that presentation; opening the app alone saves no new preference.
On the shared globe and map, drag, pinch, scroll or use camera keys to take control of a story’s
framing. Its timeline keeps running. **Recenter** (also double-click or `0`) restores the current shot
without restarting the story. Float Dive fades back to the globe while you explore; Recenter returns
to its underwater view at the selected measurement. Local sky and lunar surface views retain their
own direction and route controls.

## Explore

The rail starts with independent earthquake, tropical cyclone, wildfire, flood, volcano, aurora and radar switches.
Storm radar starts off and loads recent worldwide scans only while enabled in Explore. Its playback
appears below the switches, using a separate clock from the earthquake timeline. Turning it off stops
playback and releases decoded images. Recent radar is unavailable in archive mode. **All stories & data** returns to the full
catalogue. Layer visibility stays on this device; shared event targets override a hidden layer.
Earthquake controls fold out of the way when that layer is off, while the report time window remains.
The feed counter covers seven automatically checked background sources. Other views check their own
sources when opened; a recorded journey is not a live feed. Tropical cyclones are global GDACS reports,
while Storm Radar uses RainViewer’s worldwide available radar coverage with an optional NOAA
contiguous-US detail view. Uncovered areas are marked, rather than presented as clear weather.

- Drag to orbit, scroll to zoom, or use the arrow keys and `+` / `-`. Press `0` to reset the camera.
- Select an earthquake to pin its details and see each agency's original magnitude and scale.
- Change magnitude, feeds, or the time window. Search by region or place.
- Zoom from a wide overview to 12× with the wheel, pinch or keyboard. On the map, dragging follows
  the pointer at the current magnification.
- Choose **Map** to unfold the globe at its seam. Choose **Globe** to wrap it back up. On the flat map,
  draw a cross-section with Shift-drag. Release the line to fold it open into the depth chart.
- Browse any completed UTC day, including notable earthquakes and eclipses. Find the total eclipse
  of 8 April 2024 under **Live Earth → Replays** in the Observatory or **Eclipses** in Explore. Choose
  **Watch eclipse** in Globe view, then pause or scrub to follow the shadow at a specific UTC time.
- Pin an earthquake and open **Follow the wave**. Pick a nearby city to see the estimated P and
  S arrivals, with a fixed overview under reduced motion. The city picker lists up to six places
  within 700 km.
- Choose **Replay sequence** in a pinned earthquake’s nearby activity to see the recorded events
  appear in order. The UTC timeline can be scrubbed, including in the fixed reduced-motion view.
- Open **Watch Tōhoku rupture** from the 11 March 2011 archive or the pinned mainshock.
- On a phone, switch between globe space and recent events using the bottom navigation.
- Use **Save image** to share or download a captioned image. If native sharing fails, **Download image**
  keeps that captured frame available. Cancelling the share sheet leaves the page alone.
  The URL retains the projection, presentation, and selection.
- Press `f` for fullscreen, Space to play the window, and `,` / `.` to step through it.
  On the time slider, Home selects the start and End returns to live (or the archived day end).

## Validate

```bash
pnpm run verify          # repository checks and the complete browser suite
pnpm run test:heap       # unit and performance tests with the memory gate enabled
pnpm run test:e2e        # release journeys and separate development-only camera probes
pnpm run test:e2e:build  # release journeys only, against the production bundle
pnpm run test:live       # deliberate check against real agency endpoints
```

CI runs browser shards on separate runners so each has its own software-rendered globe.
Every shard must pass. Job logs record durations; failed runs retain results and traces as artifacts. Live feed checks
run separately on a daily schedule and do not block pull requests.
The ordinary journeys run against the release bundle; only camera/store instrumentation uses
the development server. [Quality checks](docs/quality.md) explains the two origins and local captures.

See [quality checks](docs/quality.md) for recovery and responsive coverage.
Use the [visitor walkthrough](docs/visitor-review.md) for real-phone and first-visit observations.

## Data and attribution

| Layer | Source |
| --- | --- |
| Live earthquakes | USGS HTTPS feeds and EMSC WebSocket / catalogue |
| Archived earthquakes | USGS and EMSC FDSN endpoints |
| Live storms, volcanoes, wildfires, floods | GDACS, retaining the credited reporting agency |
| Archived hazards | NASA EONET |
| Float Dive | [Argo profile data](https://doi.org/10.17882/42182) via the [Marine Institute’s North Atlantic subset](https://erddap.marine.ie/erddap/info/argoFloats/) |
| Storm Radar | [RainViewer international radar network](https://www.rainviewer.com/) ([API terms](https://www.rainviewer.com/api.html), [limits](https://www.rainviewer.com/api/transition-faq.html)) · [NOAA MRMS US detail](https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer) |
| Orbital Pass | [CelesTrak ISS orbital elements](https://celestrak.org/NORAD/elements/) and SGP4 predictions |
| Tide Watch and River Pulse | [NOAA water levels and tide predictions](https://api.tidesandcurrents.noaa.gov/api/dev) and [USGS continuous streamflow](https://api.waterdata.usgs.gov/) |
| Seafloor Flight | [GEBCO 2026 elevation and source-type grid](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid), resampled regional cutaway with labelled exaggeration; not for navigation |
| Close Encounter / Earth’s Shadow | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) apparent positions and [NASA’s March 2025 lunar eclipse](https://eclipse.gsfc.nasa.gov/LEplot/LEplot2001/LE2025Mar14T.pdf); eclipse red tint is illustrative |
| Glacier Flow | [NASA ITS_LIVE](https://its-live.jpl.nasa.gov/) annual Greenland velocity mosaics v2.1 |
| Atmospheric River | [NOAA GFS](https://www.nco.ncep.noaa.gov/pmb/products/gfs/) through [NSF Unidata](https://thredds.ucar.edu/); bounded current and dated forecasts |
| El Niño Pulse | [NOAA PMEL TAO/TRITON](https://www.pmel.noaa.gov/gtmba/) daily buoy temperatures, aggregated by month |
| Ocean Bloom / Spring Wave | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) Aqua MODIS chlorophyll/natural color and Terra MODIS 16-day NDVI |
| Reef Heat | [NOAA Coral Reef Watch](https://coralreefwatch.noaa.gov/product/5km/index.php) daily heat stress and sea-surface temperature through [PolarWatch](https://polarwatch.noaa.gov/erddap/) |
| Vanishing Sea | [European Commission JRC Global Surface Water](https://global-surface-water.appspot.com/download), Landsat-derived annual classification; original data credits JRC / Google |
| Wind Atlas | [NOAA GFS](https://www.nco.ncep.noaa.gov/pmb/products/gfs/) via [PacIOOS](https://www.pacioos.hawaii.edu/) for the current surface forecast and [NSF Unidata](https://www.unidata.ucar.edu/data/nsf-unidatas-thredds-data-server) for a dated 250 hPa forecast |
| Rainbelt and Lightning Live | [NASA IMERG precipitation imagery](https://gpm.nasa.gov/data/visualization/worldview) and [NOAA GOES-East GLM](https://www.star.nesdis.noaa.gov/goes/) |
| Air Watch | [EPA AirNow hourly PM₂.₅ observations](https://www.airnow.gov/about-the-data/) |
| Current Rider | [NOAA Global Drifter Program](https://www.aoml.noaa.gov/global-drifter-program/) recorded trajectories |
| Smoke Crossing and Tsunami Arrival | [NOAA GOES-East wildfire observations](https://www.weather.gov/bgm/pastNonPrecipJune05072023), NOAA ETOPO bathymetry, and [NOAA DART buoy readings](https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/tsunamis/recent-significant-events/chile-feb-2010-dart-summary) |
| Aurora forecast | NOAA SWPC OVATION |
| Sun Watch | NOAA SWPC real-time solar wind, primary GOES X-ray flux, NASA/GSFC Solar Dynamics Observatory |
| Tonight’s Sky | Local solar and lunar calculations, [JPL planetary elements](https://ssd.jpl.nasa.gov/planets/orbits/), [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) reference checks |
| Shadow Chase | NASA GSFC 2027 eclipse path table and interactive-map Besselian elements, predictions by Fred Espenak. Both sources are linked in the view. |
| Lights Return | [NASA Scientific Visualization Studio Black Marble HD](https://svs.gsfc.nasa.gov/4658/), using Suomi NPP VIIRS observations, and the [Román et al. recovery study](https://doi.org/10.1371/journal.pone.0218883) |
| Moonfall | [NASA LRO global mosaic](https://svs.gsfc.nasa.gov/4720/), [LRO stereo elevations and imagery via USGS](https://astrogeology.usgs.gov/search/map/moon_apollo_17_lroc_nac_landing_site_orthomosaic_50cm), and the [Apollo 17 rover routes reconstructed by Haase et al.](https://doi.org/10.1029/2018EA000408) |
| Meteor Nights | [International Meteor Organization 2026 and 2027 calendars](https://www.imo.net/calendar/), with calculated local radiant and moonlight geometry |
| Million-Mile View | NASA EPIC / NOAA DSCOVR [Moon transit archive](https://epic.gsfc.nasa.gov/galleries/2015/lunar_transit) and [natural-color imagery API](https://epic.gsfc.nasa.gov/about/api) |
| Deep Time | [Müller et al. (2019) EarthByte plate model](https://zenodo.org/records/11601026) (CC BY 4.0), continental reconstructions sampled through the GPlates Web Service |
| Swell Lines | NOAA NCEP GFS-Wave through [Open-Meteo](https://open-meteo.com/en/docs/marine-weather-api) (CC BY 4.0, sampled display) and measured [Scripps CDIP wave data](https://cdip.ucsd.edu/) |
| Tōhoku recorded waves | [EarthScope waveform archive](https://service.earthscope.org/fdsnws/dataselect/docs/1/help/), Global Seismographic Network [IU](https://www.fdsn.org/networks/detail/IU/) and [II](https://www.fdsn.org/networks/detail/II/) channels |
| Coastlines and replay cities | Natural Earth, public domain |
| Plate boundaries | PB2002, Bird (2003), simplified for display |
| Tōhoku rupture and shaking | USGS finite-fault model and preferred ShakeMap Atlas MMI contours |
| Katrina replay | NOAA National Hurricane Center Atlantic HURDAT2 best track |
| Tonga replay | NOAA GOES-17 ABI bands 13 and 8, one-minute ASOS via Iowa Environmental Mesonet, Wright et al. (2022) |
| Kīlauea replay | USGS lower East Rift Zone chronology, HVO helicopter footage, 3DEP reference relief, Hawaiʻi Statewide GIS historic coast |
| Iceberg Drift | UK Polar Data Centre A-68A and descendant tracks, NASA Earth Observatory images from Terra MODIS, Landsat 8 and NOAA-20 VIIRS |
| Megaflash | GOES-16 ABI infrared, Peterson et al. GOES-16 GLM reanalysis, and U.S. Census state boundaries |
| Stars | Yale Bright Star Catalogue, BSC5 |
| Constellation figures | d3-celestial, copyright (c) 2015 Olaf Frohn, BSD 3-Clause |

Storm Radar defaults to RainViewer’s international network, with two hours of observed composites at
ten-minute intervals. Coverage varies by country and excludes much of the ocean; striped areas mark
where the provider lists no radar coverage. The mask is approximate and does not report station outages.
Frame times describe composite generation, so individual contributing radars can be older. NOAA MRMS
remains available for detailed contiguous-US scans. Neither mode predicts future rain. RainViewer is
used under its free personal/educational API terms, with visible attribution and bounded requests.

The sun, moon, planets, and eclipse geometry are calculated locally. The 8 April 2024 replay uses
NASA’s two-minute path predictions from 16:40 to 19:54 UTC, with approximate shading.
[Bundled path samples and NASA source](src/geo/aprilEclipseData.ts).

The Tōhoku view compresses the modeled rupture times and exaggerates depth by four to make the
fault visible. The shaking contours show estimated intensity for the event. [USGS Tōhoku record](https://earthquake.usgs.gov/earthquakes/eventpage/usc0001xgp).

Katrina’s replay interpolates the storm center and available 34- and 64-knot quadrant radii between
published fixes. The readout keeps each fix’s estimated maximum sustained winds and central
pressure. The radii are missing at the Buras fix, so that view omits the overlays.
[NHC Katrina report](https://www.nhc.noaa.gov/data/tcr/AL122005_Katrina.pdf).

Tonga’s satellite views use colorized crops of the original infrared scans and differences
between consecutive water-vapor scans. The scan labels use UTC start times. The globe’s ring
estimates the first atmospheric Lamb wave using the published origin time and travel time to the
antipode. The station charts retain the measured minute-by-minute pressure, converted to hPa.
[NOAA GOES archive](https://registry.opendata.aws/noaa-goes/) ·
[ASOS archive](https://mesonet.agron.iastate.edu/request/asos/1min.phtml) ·
[Wright et al.](https://doi.org/10.1038/s41586-022-05012-5).

Kīlauea’s map dates use Hawaiʻi Standard Time. Lava entered Kapoho Bay late on June 3. The
June 4 evening snapshot is the first dated map in the replay with the new delta. The comparison
uses the Hawaiʻi Statewide GIS coastline derived from 1983 USGS maps and the final mapped 2018
Fissure 8 deposit. The shaded relief provides a fixed reference surface across the dates.
[USGS lava maps](https://doi.org/10.5066/P9S7UQKQ) ·
[Historic coastline metadata](https://files.hawaii.gov/dbedt/op/gis/data/coastline.pdf) ·
[HVO June 4 overflight](https://www.usgs.gov/media/videos/kilauea-volcano-lava-entering-kapoho-bay).

Iceberg Drift covers November 5, 2020 through April 16, 2021. It smooths movement between
consecutive positions in the source catalogue and leaves missing dates as gaps. The catalogue
interpolated some isolated cloudy days. A hollow marker shows the last position available at the
selected date. A-68A’s area appears only on dates with a Sentinel-1 radar measurement. [Smith and Bigg, UK Polar Data Centre](https://doi.org/10.5285/d56d9e3f-80d2-4076-9e70-24f662c0e362) ·
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) ·
[NASA approach](https://science.nasa.gov/earth/earth-observatory/iceberg-a-68a-nears-south-georgia-147535/) ·
[NASA breakup](https://science.nasa.gov/earth/earth-observatory/iceberg-goes-with-the-flow-147715/) ·
[NASA fragments](https://science.nasa.gov/earth/earth-observatory/pieces-of-iceberg-a-68a-147785/).

Megaflash’s infrared backdrop is a false-color GOES-16 scan from 08:52 UTC. The animation
samples the time-coded optical trace in the published GOES-16 reanalysis in approximate
250 ms bins. Occluded or ambiguous colors can leave gaps. The 829 ± 8 km extent and
7.39-second duration come from the study.
[Peterson et al.](https://doi.org/10.1175/BAMS-D-25-0037.1) ·
[NOAA GOES-16](https://www.nesdis.noaa.gov/news/noaa-satellites-help-certify-worlds-longest-lightning-flash) ·
[WMO certification](https://wmo.int/news/media-centre/wmo-certifies-megaflash-lightning-record-usa).

Sun Watch follows SWPC’s active upstream spacecraft and the primary GOES 0.1–0.8 nm band.
Each plot shows its own observation time. The solar disk is an archived image from September
10, 2025, and the motion of the schematic stream reflects the latest wind sample. The separate
OVATION view shows the aurora forecast.
[NOAA solar wind](https://www.swpc.noaa.gov/products/solar-wind) ·
[GOES X-rays](https://www.swpc.noaa.gov/products/goes-x-ray-flux) ·
[NASA/GSFC/SDO image](https://www.jpl.nasa.gov/images/pia26681-image-of-sun-from-nasas-solar-dynamics-observatory/).

Colour represents magnitude. Other hazards use distinct shapes, with neutral interface controls.

Under **Earthquake display & sky guides**, **Regional cutaway** opens the pinned earthquake's region, or the
centre of the view. Orbit to inspect events at their reported depths. The neutral well has 300 km
reference guides down to 900 km; it does not represent geological layers. Switch the cutaway off
in the same menu, or turn depth off. The flat map temporarily hides the opening. Constellations
trace on enable, and camera coordinates appear briefly while you move the view. Reduced motion
keeps all actions available with these effects skipped.

## Limits

The reconciliation rule can combine nearby aftershocks with a mainshock. Both agencies'
readings remain visible; [reconciliation policy](SYSTEM.md#reconciliation) explains the tradeoff.
An unanswered feed is shown separately from a feed that reports no events.

Historical coverage is uneven, especially before 1970. Archived hazards use EONET rather than
the live GDACS catalogue, and aurora is only a forecast. Eclipse shadows are approximate
illustrations. This is an exploration tool, not an emergency alert or eclipse forecast service.

The default week window downloads a larger earthquake seed than the daily window. Optional
slab, plate-motion, and constellation data load when requested. WebGL is required for the globe;
if it cannot start, the event list and filters remain available.

## Repository

[SYSTEM.md](SYSTEM.md) describes the current boundaries and data flow.
[ARCHITECTURE.md](ARCHITECTURE.md) explains indexed engineering constraints.
[DESIGN.md](DESIGN.md) defines the visual system.

Pushing to `main` triggers the existing Cloudflare deployment after verification succeeds.
The app serves static assets with a small anonymous aggregate-analytics Worker and no database. Most feeds load directly in the browser; GFS and Coral Reef Watch use three fixed, hourly cached same-origin routes. See [DEPLOY.md](DEPLOY.md).

Code is [MIT licensed](LICENSE). Report vulnerabilities through
[private reporting](https://github.com/aiden-jang/everythingisfine/security/advisories/new).

The SVG globe mark in `public/icon.svg` also has committed 32px browser and
180px Apple touch PNGs. Keep the Apple variant opaque and square; iOS applies its
own mask. The PNGs are raster derivatives of that SVG, without changing the globe.

Aggregate traffic and feature-event coverage, privacy boundaries and queries: [Analytics](docs/ANALYTICS.md).
