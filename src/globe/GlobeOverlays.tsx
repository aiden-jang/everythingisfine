import { CameraRecenter } from "./CameraRecenter";
import { PlaceLabels } from "./PlaceLabels";
import type { CameraGuidance } from "./cameraGuidance";
import { geographicCoordinates } from "./orbitReadout";
import type { CutawayFocus } from "./cutaway";
import { CUTAWAY_DEPTH_KM, CUTAWAY_GUIDES_KM } from "./cutawayScale";
import type { RefObject } from "react";

interface OverlayRefs {
  guide: CameraGuidance | null;
  wake: () => void;
  selected: string | null;
  orbit: RefObject<HTMLDivElement>;
  cutaway: CutawayFocus | null;
  marker: RefObject<HTMLDivElement>;
  hoverRing: RefObject<HTMLDivElement>;
  scaleBar: RefObject<HTMLDivElement>;
  scaleText: RefObject<HTMLSpanElement>;
  scaleRule: RefObject<HTMLDivElement>;
  sectionLine: RefObject<SVGSVGElement>;
  tooltip: RefObject<HTMLDivElement>;
}

export function GlobeOverlays({
  guide,
  wake,
  selected,
  orbit,
  cutaway,
  marker,
  hoverRing,
  scaleBar,
  scaleText,
  scaleRule,
  sectionLine,
  tooltip,
}: OverlayRefs): JSX.Element {
  return (
    <>
      <PlaceLabels />
      {guide ? <CameraRecenter guide={guide} wake={wake} /> : null}
      <div
        ref={orbit}
        data-orbit-readout
        data-visible="false"
        aria-hidden="true"
        className="orbit-readout pointer-events-none absolute top-[var(--scene-hud-top)] left-4 md:ml-[var(--rail-w)] md:translate-x-8 border border-hairline bg-deck/90 px-2 py-1 font-mono text-[10px] text-dim tabular-nums"
      />
      {cutaway && !cutaway.cameraOnly ? (
        <div
          role="status"
          className="cutaway-note pointer-events-none absolute top-[var(--scene-hud-top)] left-4 max-w-[220px] border border-hairline bg-deck/95 p-2 text-[10px] text-dim md:ml-[var(--rail-w)] md:translate-x-8"
        >
          <span className="label block">Regional cutaway · true scale</span>
          <span className="mt-1 block font-mono tabular-nums">{geographicCoordinates(cutaway)}</span>
          <span className="mt-1 block">
            Guide rings every {CUTAWAY_GUIDES_KM[1]} km, to {CUTAWAY_DEPTH_KM} km. Orbit to inspect below the
            surface.
          </span>
        </div>
      ) : null}
      {/* Achromatic: a coloured ring would be a hue meaning nothing beside hues that mean magnitude. */}
      <div
        ref={marker}
        className="pick pointer-events-none absolute top-0 left-0 size-7 opacity-0 transition-opacity duration-150"
      >
        <span key={selected} className="pick-corners absolute inset-0" />
      </div>
      {/* Lighter than the selection ring, because hovering is not choosing. */}
      <div
        ref={hoverRing}
        className="pointer-events-none absolute top-0 left-0 size-5 rounded-full border border-dim opacity-0 transition-opacity duration-100"
      />
      {/* A ruler rather than a readout: the rule is the measurement and the text names it, so the bar's
          width changes and the number stays round. `aria-hidden`, because the feed already gives
          distances per event and a ruler is a thing you hold against a picture. */}
      <div
        ref={scaleBar}
        data-scale
        aria-hidden="true"
        /* Offset past the rail, like the bottom band. The canvas is full-bleed and the rail floats over
           it, so a bar at the container's own left edge is drawn underneath the rail. */
        className="pointer-events-none absolute bottom-32 left-4 opacity-0 transition-opacity duration-200 md:bottom-[76px]
          md:ml-[var(--rail-w)]"
      >
        <span ref={scaleText} className="block font-mono text-[10.5px] text-faint tabular-nums" />
        {/* Ticked at both ends. A bare line has no start or finish, and the eye measures from wherever it
            looks first. */}
        <div ref={scaleRule} className="mt-1 h-[5px] border-x border-b border-dim" />
      </div>
      {/* Achromatic like every other piece of chrome: the section's own panel carries the ramp. */}
      <svg
        ref={sectionLine}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-150"
      >
        {/* The corridor first, so the centre line and its caps paint over it. Undashed: two more dashed
            lines would read as three sections rather than one with a width. See ARCHITECTURE.md#srcglobeglobeoverlaystsx. */}
        <line stroke="currentColor" strokeWidth={1} className="text-coast" />
        <line stroke="currentColor" strokeWidth={1} className="text-coast" />
        <line stroke="currentColor" strokeWidth={1} className="text-ink" strokeDasharray="5 4" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
      </svg>
      <div
        ref={tooltip}
        /* `truncate` belongs on the name inside, not on the box: on the box it clips to one line and the
           measurement line existed but was never shown. */
        /* On the sans step, like every other piece of prose here. This is the label you read at arm's
           length while the pointer moves, so half a step below body size was the wrong pixel to save. */
        className="pointer-events-none absolute top-0 left-0 max-w-[260px] border border-hairline bg-raised px-2 py-1 text-[11px] leading-snug text-ink opacity-0"
      />
    </>
  );
}
