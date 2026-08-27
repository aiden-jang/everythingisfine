import { antipodeCross, antipodeOf, FRONT_ARCS, smallCircle } from "../geo/antipode";
import { motionArrow, type MotionSample } from "../geo/plateMotion";
import type { Mark } from "../globe/marks";
import { flame, here as hereTicks, spiral, volcano, waves } from "../globe/shapes";
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
  /**
   * Roughly where the reader is, or null when their timezone did not resolve to a place.
   *
   * **No new disclosure.** It comes from `Intl` naming a timezone and a committed table turning that into
   * a city, which the rail already uses to say what the closest earthquake to them was. It is city-level
   * at best, it never leaves the browser, and drawing it says nothing the app was not already saying.
   */
  here?: { lon: number; lat: number } | null;
}

/*
 * The reporting agency, appended to a label that already has words in it.
 *
 * Earthquakes have carried their provenance since the beginning: two feeds named in the header, the
 * agency in the panel, a corroboration count. The hazards carried none, and GDACS was sending it on
 * every event. Same rule, applied to the other third of the marks.
 *
 * Appended rather than given a row of its own, because it is a qualifier on a fact and not a fact: "who
 * says" belongs beside "what", the way the panel puts the agency under the magnitude rather than above
 * it. Absent when the feed did not say, which is every hazard on an archived day.
 */
function by(label: string, source: string | null): string {
  return source === null ? label : `${label} · ${source}`;
}

export function marksFor(
  { cyclones, volcanoes, fires, floods, farSide = null, motion = [], here = null }: Happening,
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
  /*
   * Anchored, so it holds one size on screen.
   *
   * It is a symbol rather than a measured extent - unlike the storm tracks and the motion arrows, whose
   * length is the quantity they carry. Four strokes, four marks, one anchor between them, which is what
   * keeps the ticks pointing at the same spot as the globe turns.
   *
   * Unlabelled and unpickable on purpose. There is nothing to ask it: the key names the city, which is
   * better than a tooltip because it is on screen without anybody having to find the mark first.
   */
  if (here) {
    for (const tick of hereTicks(here.lon, here.lat)) {
      out.push({ points: tick, anchor: { lon: here.lon, lat: here.lat } });
    }
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
      label: by(
        storm.peakKmh === null ? storm.name : `${storm.name} · ${Math.round(storm.peakKmh)} km/h`,
        storm.source,
      ),
    });
  }
  for (const v of volcanoes) {
    // No date in the label. The one thing that has to be said about a volcano here is that it is not
    // live, and that is a sentence rather than a tooltip: the card says it, the legend says it.
    out.push({
      points: volcano(v.lon, v.lat), anchor: at(v), id: `volcano:${v.id}`,
      label: by(v.country ? `${v.name} · ${v.country}` : v.name, v.source),
    });
  }
  for (const f of fires) {
    out.push({
      points: flame(f.lon, f.lat), anchor: at(f), id: `fire:${f.id}`,
      // Area in km2 to match the legend's unit, from hectares, and omitted rather than guessed at zero.
      label: by(
        f.hectares === null
          ? (f.country || "Forest fire")
          : `${f.country || "Forest fire"} · ${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
        f.source,
      ),
    });
  }
  // Three strokes each, all sharing one anchor and one id, so a flood is one mark and not three.
  for (const f of floods) {
    for (const row of waves(f.lon, f.lat)) {
      // No measure: every flood in this feed is filed as magnitude zero, so the label says where and
      // nothing about how bad, exactly as the legend refuses to.
      out.push({
        points: row, anchor: at(f), id: `flood:${f.id}`,
        label: by(f.country || "Flood", f.source),
      });
    }
  }
  return out;
}

const at = (p: { lon: number; lat: number }): { lon: number; lat: number } =>
  ({ lon: p.lon, lat: p.lat });
