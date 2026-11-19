# Everything Is Fine

An observatory for Earth, ocean, and sky. [Open the live project](https://meanwhile.aidenjang.com/).

I wanted to give scientific observations a sense of place. An earthquake feed can tell you when and
where the ground moved. A float profile can tell you the temperature at a particular depth.
Everything Is Fine lets you see where those readings happened, follow their progression, and return
to the view you were exploring.

## Three ways into the observatory

- **Explore the globe.** Start with the live world and choose what to see. Radar, earthquake reports,
  and the aurora forecast have independent controls and source times. You can flatten the globe
  into a map and keep your place.
- **Follow Float Dive.** Locate an Argo float in the North Atlantic, then follow it through an
  illustrated ocean section. Scrubbing the rise selects real samples of temperature and
  salinity. Pressure determines the estimated depth, and the display labels that estimate.
- **Replay Tonga’s shockwave.** Start with time-stamped GOES-17 imagery, then follow the modeled
  atmospheric wave. Compare its estimated crossing with measured changes in station pressure.
  The replay keeps the distinction visible throughout.

## One world across the app

The landing view, Explore, and stories share one mounted Three.js renderer. The camera changes
projection and framing as the interface changes around it. Stories supply their geographic
anchors, time, and layers to the scene. Places and markers stay registered while the view changes.

A story can guide the camera while it plays. A drag or zoom during a guided shot hands control
back to the visitor. On return, the app restores the catalogue query, category, scroll, focus,
projection, and camera. The same flow works with reduced motion and a smaller screen.

## Make the data legible

Live reports, forecasts, predictions, and archived observations each have their own time and
source. A missing feed is reported separately from a feed that returned an empty result.
When two agencies describe the same earthquake, the explorer preserves both readings and
magnitude scales. Historical imagery and station measurements stay tied to their source dates.
[See the data credits](../README.md#data-and-attribution).

## Keep the work bounded

The browser talks directly to most sources. A small Cloudflare Worker relays fixed public
requests for providers that do not allow browser access. There is no account or database for
observations or saved moments. Saved visits stay on the device, and share links encode a view.

Story code and assets load when needed. Camera and timeline updates use the existing frame loop.
Rendering settles when motion and live changes settle, and heavier visual assets have separate
budgets from the initial application. The production build is tested against recorded feeds so
an agency outage can be reported without making releases depend on that agency.
[Read the architecture](../SYSTEM.md) · [See the verification approach](quality.md).
