import { antipodeCross, antipodeOf, FRONT_ARCS, smallCircle } from "../geo/antipode";
import { motionArrow, type MotionSample } from "../geo/plateMotion";
import type { Mark } from "../globe/marks";
import { flame, spiral, volcano, waves } from "../globe/shapes";
import type { Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";

/*
 * Which shapes exist, from what is happening.
 *
 * The one place that knows both the phenomena and the glyphs, so the scene can take polylines and know
 * nothing about storms or fires, and `shapes.ts` can draw outlines and know nothing about feeds.
 *
 * Four outlines, no hue between them: a spiral is a storm, a triangle a volcano, a flame a fire, three
 * wavy lines a flood. That is the rule the aurora set - light gets colour, marks get shapes - and it is
 * what lets five layers share a globe without any of them borrowing the magnitude ramp.
 */

export interface Happening {
  cyclones: readonly Cyclone[];
  volcanoes: readonly Volcano[];
  fires: readonly Wildfire[];
  floods: readonly Flood[];
  /**
   * The event whose far side is being traced, or null.
   *
   * Asked for explicitly from the panel rather than drawn on every selection: it is five circles across
   * the whole planet, and putting that behind an ordinary click would ambush anybody who only wanted to
   * read a magnitude.
   */
  farSide?: { lon: number; lat: number } | null;
  /**
   * The plate-motion samples to draw, empty for none.
   *
   * The samples rather than a flag, so this stays a pure function of its input and the 7.1kB table is
   * loaded by whoever turned the toggle on rather than by importing this file.
   */
  motion?: readonly MotionSample[];
}

export function marksFor(
  { cyclones, volcanoes, fires, floods, farSide = null, motion = [] }: Happening,
): Mark[] {
  const out: Mark[] = [];
  /*
   * Unanchored, like the far-side arcs: an arrow's length is its speed, so holding it at a constant size
   * on screen would delete the only quantity it carries.
   */
  for (const [lon, lat, azimuth, rate] of motion) {
    for (const stroke of motionArrow(lon, lat, azimuth, rate)) out.push({ points: stroke });
  }
  /*
   * Unanchored, all of it. These are arcs at fixed distances on the real sphere, so they scale with the
   * coastline like the storm tracks do - a 90-degree circle held at a constant size on screen would be
   * the one thing this figure cannot afford, since its whole point is how big the front gets.
   */
  if (farSide) {
    for (const arc of FRONT_ARCS) {
      out.push({ points: smallCircle(farSide.lon, farSide.lat, arc) });
    }
    const far = antipodeOf(farSide.lon, farSide.lat);
    for (const stroke of antipodeCross(far.lon, far.lat)) out.push({ points: stroke });
  }
  for (const storm of cyclones) {
    // The track carries no anchor: it is measured geography and scales with the coastline, not with the
    // symbol standing on its head. It is not pickable either - the spiral is the thing you point at.
    if (storm.track.length > 1) out.push({ points: storm.track });
    /*
      Name and peak wind, which is the pair the legend already leads with.
      Their own label describes a different moment - a storm measured at 259 km/h is filed as "Tropical
      Storm" - so the number here is GDACS's wind and never their word for it.
    */
    out.push({
      points: spiral(storm.lon, storm.lat), anchor: at(storm), id: `cyclone:${storm.id}`,
      label: storm.peakKmh === null
        ? storm.name
        : `${storm.name} · ${Math.round(storm.peakKmh)} km/h`,
    });
  }
  for (const v of volcanoes) {
    // No date in the label. The one thing that has to be said about a volcano here is that it is not
    // live, and that is a sentence rather than a tooltip: the card says it, the legend says it.
    out.push({
      points: volcano(v.lon, v.lat), anchor: at(v), id: `volcano:${v.id}`,
      label: v.country ? `${v.name} · ${v.country}` : v.name,
    });
  }
  for (const f of fires) {
    out.push({
      points: flame(f.lon, f.lat), anchor: at(f), id: `fire:${f.id}`,
      // Area in km2 to match the legend's unit, from hectares, and omitted rather than guessed at zero.
      label: f.hectares === null
        ? (f.country || "Forest fire")
        : `${f.country || "Forest fire"} · ${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
    });
  }
  // Three strokes each, all sharing one anchor and one id, so a flood is one mark and not three.
  for (const f of floods) {
    for (const row of waves(f.lon, f.lat)) {
      // No measure: every flood in this feed is filed as magnitude zero, so the label says where and
      // nothing about how bad, exactly as the legend refuses to.
      out.push({
        points: row, anchor: at(f), id: `flood:${f.id}`,
        label: f.country || "Flood",
      });
    }
  }
  return out;
}

const at = (p: { lon: number; lat: number }): { lon: number; lat: number } =>
  ({ lon: p.lon, lat: p.lat });
