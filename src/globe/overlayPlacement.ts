import type { RefObject } from "react";
import type { createGlobe } from "./scene";
import type { Feed } from "../app/feed";
import type { GlobeProps } from "./GlobeProps";
import type { Quake } from "../data/types";
import { distanceLabel, magnitude } from "../app/format";
import { between, seconds } from "../app/arrival";
import { sinkFraction } from "./events";
import { sectionEdges, type SectionLine } from "../app/section";
import { kmPerPixel, latitudeLabel, niceScale } from "./scale";
import { matches } from "../data/filter";

type Target = { kind: "quake" | "mark"; id: string } | null;
type State = Pick<
  Required<GlobeProps>,
  "selected" | "marks" | "inspection" | "depthSink" | "section" | "filters" | "scrubAt"
>;
interface Placement {
  el: HTMLCanvasElement;
  globe: ReturnType<typeof createGlobe>;
  feed: Feed;
  read: () => State;
  clockAt: () => number;
  hover: () => Target;
  drag: RefObject<SectionLine | null>;
  tooltip: RefObject<HTMLDivElement>;
  hoverRing: RefObject<HTMLDivElement>;
  marker: RefObject<HTMLDivElement>;
  sectionLine: RefObject<SVGSVGElement>;
  scaleBar: RefObject<HTMLDivElement>;
  scaleRule: RefObject<HTMLDivElement>;
  scaleText: RefObject<HTMLSpanElement>;
}
const SCALE_TARGET_PX = 110;

export function overlayPlacement({
  el,
  globe,
  feed,
  read,
  clockAt,
  hover,
  drag,
  tooltip,
  hoverRing,
  marker,
  sectionLine,
  scaleBar,
  scaleRule,
  scaleText,
}: Placement) {
  let tooltipKey = "";
  return () => {
    const state = read();
    const hovered = hover();
    const box = el.getBoundingClientRect();
    const locate = (t: {
      kind: "quake" | "mark";
      id: string;
    }): { lon: number; lat: number; label: string; quake: Quake | null } | null => {
      if (t.kind === "quake") {
        const q = feed.store.get(t.id);
        if (!q) return null;
        if (
          t.id !== state.selected &&
          (!matches(q, state.filters, clockAt()) ||
            (state.scrubAt !== null && q.primary.time > state.scrubAt))
        )
          return null;
        return {
          lon: q.primary.lon,
          lat: q.primary.lat,
          label: `${magnitude(q.primary)} ${q.primary.place}`,
          quake: q,
        };
      }
      const mark = state.marks.find((m) => m.id === t.id && m.anchor !== undefined);
      if (!mark?.anchor || mark.label === undefined) return null;
      return { lon: mark.anchor.lon, lat: mark.anchor.lat, label: mark.label, quake: null };
    };
    const put = (
      node: HTMLDivElement | null,
      target: { kind: "quake" | "mark"; id: string } | null,
      offsetY: number,
    ): void => {
      if (!node) return;
      const found = target && state.inspection?.kind !== "sequence" ? locate(target) : null;
      const radius =
        found?.quake && state.depthSink
          ? 1 - sinkFraction(found.quake.primary.depthKm) * (1 - globe.controls.morph())
          : 1;
      const at = found ? globe.controls.project(found.lon, found.lat, radius) : null;
      node.style.opacity = at ? "1" : "0";
      if (!at || !found) return;
      /*
       * The ring and the bracket take their size from the mark they are on. Fixed pixels were chosen when
       * the largest marker was 8.8px, and the scale is wider now and grows with the zoom besides.
       */
      if (node === hoverRing.current || node === marker.current) {
        const mag = found.quake?.primary.magnitude;
        const radius = mag === undefined ? 7 : globe.markerRadius(mag);
        const clear = node === marker.current ? 9 : 5;
        const size = Math.round(radius * 2 + clear * 2);
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
      }
      if (node === tooltip.current) {
        // Show the distance to a distinct pinned event alongside the hovered place.
        const pinned = state.selected ? feed.store.get(state.selected) : undefined;
        const pair =
          pinned && pinned.key !== found.quake?.key
            ? between(pinned.primary.lon, pinned.primary.lat, found.lon, found.lat)
            : null;
        const distance = pair
          ? pair.p !== null && found.quake !== null
            ? `${distanceLabel(pair.km)} from the pin · ${seconds(pair.p)}`
            : `${distanceLabel(pair.km)} from the pin`
          : "";
        const key = `${found.label}\n${distance}`;
        if (key !== tooltipKey) {
          tooltipKey = key;
          node.replaceChildren();
          const name = document.createElement("div");
          name.className = "truncate";
          name.textContent = found.label;
          node.append(name);
          if (distance) {
            const gap = document.createElement("div");
            gap.className = "font-mono text-dim tabular-nums";
            gap.textContent = distance;
            node.append(gap);
          }
        }
      }
      node.style.transform =
        `translate(${at.x - box.left}px, ${at.y - box.top + offsetY}px) ` +
        `translate(-50%, ${offsetY === 0 ? "-50%" : "-100%"})`;
    };
    /*
     * The section line in SVG, not in the scene: it is chrome, not geography, and `project` already turns
     * a coordinate into a screen position for the tooltip.
     */
    const svg = sectionLine.current;
    if (svg) {
      const draft = drag.current;
      // Map only. A great circle projects to a curve on a globe, so a straight screen line between two
      // projected points would be a wrong picture rather than a simplified one.
      const line = globe.controls.morph() === 1 ? (draft ?? state.section) : null;
      const a = line ? globe.controls.project(line.fromLon, line.fromLat) : null;
      const b = line ? globe.controls.project(line.toLon, line.toLat) : null;
      svg.style.opacity = a && b ? "1" : "0";
      if (a && b && line) {
        const span = (i: number, p: { x: number; y: number }, q: { x: number; y: number }): void => {
          const el = svg.children[i] as SVGLineElement | undefined;
          el?.setAttribute("x1", `${p.x - box.left}`);
          el?.setAttribute("y1", `${p.y - box.top}`);
          el?.setAttribute("x2", `${q.x - box.left}`);
          el?.setAttribute("y2", `${q.y - box.top}`);
        };
        // Projected end by end, not offset in screen space: a fixed pixel offset is right at the equator
        // and wrong everywhere else. `sectionEdges` does it on the sphere.
        sectionEdges(line).forEach((edge, i) => {
          const p = globe.controls.project(edge.fromLon, edge.fromLat);
          const q = globe.controls.project(edge.toLon, edge.toLat);
          if (p && q) span(i, p, q);
        });
        span(2, a, b);
        const cap1 = svg.children[3] as SVGCircleElement | null;
        const cap2 = svg.children[4] as SVGCircleElement | null;
        cap1?.setAttribute("cx", `${a.x - box.left}`);
        cap1?.setAttribute("cy", `${a.y - box.top}`);
        cap2?.setAttribute("cx", `${b.x - box.left}`);
        cap2?.setAttribute("cy", `${b.y - box.top}`);
      }
    }

    put(marker.current, state.selected === null ? null : { kind: "quake", id: state.selected }, 0);
    // The ring is the earthquakes' highlight only. A circle round a spiral reads as part of the drawing,
    // so a glyph brightens itself in the mark layer instead.
    put(hoverRing.current, hovered?.kind === "quake" ? hovered : null, 0);
    put(tooltip.current, hovered, -18);

    /*
     * The scale bar, quoted at the latitude in the middle of the view rather than at the bar's own row.
     * Zoomed out, the corner the bar sits in is void, so asking what latitude is under it returns nothing
     * and the bar never appeared. The centre is the more useful of the two anyway.
     */
    const bar = scaleBar.current;
    if (bar) {
      const flat = globe.controls.morph() === 1 && globe.controls.localSky.amount() === 0;
      const { lat } = globe.controls.state();
      const drawn = flat ? niceScale(kmPerPixel(globe.controls.degPerPx(), lat), SCALE_TARGET_PX) : null;
      // Hidden on the globe, which carries its own scale by being a ball, and mid-morph, where a number
      // read off a half-flattened projection is a number about nothing.
      bar.style.opacity = drawn ? "1" : "0";
      if (drawn && scaleRule.current && scaleText.current) {
        scaleRule.current.style.width = `${Math.round(drawn.px)}px`;
        scaleText.current.textContent = `${distanceLabel(drawn.km)} at ${latitudeLabel(lat)}`;
      }
    }
  };
}
