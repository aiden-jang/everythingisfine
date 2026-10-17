# Current architecture

Everything Is Fine is a static TypeScript app built with Vite, Preact through React-compatible
imports, Tailwind, and three.js. Public providers are reached directly from the browser.
It has no backend, API keys, database, or server-side cache.

## Data flow

1. `src/sources` adapts USGS polling, the EMSC socket and catalogue, GDACS hazards, EONET history,
   and NOAA aurora into typed readings. Fixtures settle parsing; live tests check provider contracts.
2. `src/data/store.ts` bounds retained events and revisions. `src/data/reconcile.ts` associates
   accounts from different agencies while preserving their published magnitude and scale.
3. `src/app/feed.ts` owns source lifecycle, coverage, retention, and switching between live and archive.
4. `src/App.tsx` composes the view, filters, selected event, timeline, and shared URL.
   It passes data and callbacks into the rail, detail sheet, and globe.
5. `src/globe/scene.ts` owns WebGL resources and scene layers. `src/globe/controls.ts` owns geographic
   camera movement and picking. `src/globe/Globe.tsx` bridges the scene and app, redrawing only while
   motion or changed data requires it.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `src/app/useArchive.ts` | Archive request ownership, stale-response protection, date navigation, source coverage |
| `src/app/ArchiveControls.tsx` | Date entry, calendar, notable days, and eclipse controls |
| `src/app/useStill.ts` | Synchronous canvas capture, caption, native sharing, download fallback |
| `src/app/useGlobeResources.ts` | Deferred geometry and timezone data, retained while disabled, with completion cleanup |
| `src/app/useGlobeTour.ts` | Captured tour route, dwell timers, interaction cancellation, and camera-arrival narration |
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

Preferences write in their setters, never on initial mount. A shared link can override the initial
view without turning defaults into stored choices. The sheet height uses the same preference path.

Camera springs integrate fixed slices for stability. The frame loop accepts slow-display elapsed
time up to a bounded pause, keeping movement from stretching with software-rendered frames.
Replay retains wall-clock time. Reduced motion remains a separate user preference.

WebGL startup failures have a retry surface; they do not remove the event list and filters.
Scene callbacks use current refs so changing a selection does not recreate WebGL resources.
The still exporter copies the drawing buffer before the browser composites it.
Shared controls update the URL before paint; moving playback keeps its periodic URL cadence.

## Validation and history

The supported tooling runtime is pinned to Node 22, matching CI and the performance-gate calibration.
`pnpm run verify` mirrors CI. Unit tests cover pure behavior, source contracts, retention, and
performance. Browser fixtures cover actual WebGL, CSS, accessibility states, camera movement,
sharing, and responsive layouts. Daily live checks are informational and separate from merge checks.

[DEPLOY.md](DEPLOY.md) describes CI and release behavior. [DESIGN.md](DESIGN.md) owns visual rules.
[ARCHITECTURE.md](ARCHITECTURE.md) is the historical decision log and the indexed appendix for
non-obvious constraints; use this document for the current system map.
