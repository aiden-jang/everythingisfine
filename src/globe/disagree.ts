import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { DEG } from "../geo/sphere";
import { matches } from "../data/filter";
import { cellKey, cellSizeDeg } from "./cluster";
import { morphable } from "./morph";
import type { Filters } from "../data/types";
import type { Store } from "../data/store";

/*
 * The disagreement, on the map rather than only in the panel.
 *
 * Two agencies report one earthquake and place it tens of kilometres apart. That is the project's
 * subject, the reason the reconciliation code exists, and the write-up topic. On screen it was a
 * sentence you could only reach by pinning an event: the panel says "they place it 41.2 km and 6.8 s
 * apart" and lists both readings, and the map drew one marker and said nothing.
 *
 * So each corroborated event gets a hairline between the two epicentres. It is the thesis as a mark:
 * a margin full of short ties is two catalogues that broadly agree, and a long one is a disagreement
 * worth opening.
 *
 * **Achromatic, like the section line and for the same reason.** Hue inside the canvas means
 * magnitude and nothing else. A coloured tie line would be a hue meaning something new, and the
 * markers at each end already carry the magnitude.
 *
 * **Drawn only when the two ends are separately resolvable**, which is the interesting part and is
 * not a performance dodge. Below the clustering threshold two readings 30km apart fall in one cell
 * and the map collapses them to a single marker, so a line between them would be shorter than the
 * dot it sits under: a mark asserting a distinction the picture is not making. The same rule that
 * decides whether two events are one marker decides whether their disagreement can be seen.
 */

/** Just inside the markers, so a tie passes under the dots it joins rather than over them. */
const RADIUS = 1.0055;

/**
 * How many ties are held at once.
 *
 * Far above what the rule admits in practice: a whole-world view resolves almost none, and a margin
 * at full zoom is dozens. Sized for the pathological case rather than the usual one, because the
 * alternative to a generous buffer is a cap that silently drops the tie somebody was looking for.
 */
const CAPACITY = 4096;

/**
 * Whether two readings of one event are far enough apart to be worth joining.
 *
 * True when they fall in different clustering cells, which is exactly when the map is capable of
 * drawing them as two places rather than one. Above the clustering threshold the cell size is zero,
 * every point stands alone, and every pair is resolvable.
 */
export function resolvable(
  aLon: number, aLat: number, bLon: number, bLat: number, cellDeg: number,
): boolean {
  if (cellDeg <= 0) return true;
  return cellKey(aLon, aLat, cellDeg) !== cellKey(bLon, bLat, cellDeg);
}

export interface DisagreeLayer {
  object: LineSegments;
  sync: (
    store: Store, filters: Filters, now: number, zoom?: number, revealUntil?: number,
  ) => void;
  dispose: () => void;
}

export function createDisagreeLayer(morph: { value: number }): DisagreeLayer {
  const positions = new Float32Array(CAPACITY * 6);
  const lonLats = new Float32Array(CAPACITY * 4);
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const llAttr = new BufferAttribute(lonLats, 2);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aLonLat", llAttr);
  geometry.setDrawRange(0, 0);

  const material = new LineBasicMaterial({
    // Between the plate boundaries and the ink the markers are ringed in: it has to read as
    // instrument rather than as a third kind of geography sitting under the dots.
    color: 0x8a96ac,
    transparent: true,
    opacity: 0.55,
  });
  morphable(material, morph);
  const object = new LineSegments(geometry, material);
  // Over the night shell, because this is data and an earthquake at 3am is not dimmer than one at
  // noon, and under the markers at 5, because the dots are the thing and this is the relation.
  object.renderOrder = 4.8;

  return {
    object,
    sync: (store, filters, now, zoom = 3, revealUntil) => {
      const cell = cellSizeDeg(zoom);
      let n = 0;

      store.forEach((quake) => {
        if (n >= CAPACITY) return;
        // At most one reading per source and two sources, so a corroborated event has exactly two.
        if (quake.readings.length < 2) return;
        if (!matches(quake, filters, now)) return;
        if (revealUntil !== undefined && quake.primary.time > revealUntil) return;

        const a = quake.readings[0]!;
        const b = quake.readings[1]!;
        if (!resolvable(a.lon, a.lat, b.lon, b.lat, cell)) return;

        // Inlined trigonometry, for the reason `events.ts` gives at length: `toVec3` returns a fresh
        // array per call and the allocation dominates the maths it hides.
        const i = n * 6;
        const j = n * 4;
        const phiA = a.lat * DEG;
        const lamA = a.lon * DEG;
        const cA = Math.cos(phiA) * RADIUS;
        positions[i] = cA * Math.sin(lamA);
        positions[i + 1] = Math.sin(phiA) * RADIUS;
        positions[i + 2] = cA * Math.cos(lamA);
        const phiB = b.lat * DEG;
        const lamB = b.lon * DEG;
        const cB = Math.cos(phiB) * RADIUS;
        positions[i + 3] = cB * Math.sin(lamB);
        positions[i + 4] = Math.sin(phiB) * RADIUS;
        positions[i + 5] = cB * Math.cos(lamB);

        lonLats[j] = a.lon;
        lonLats[j + 1] = a.lat;
        lonLats[j + 2] = b.lon;
        lonLats[j + 3] = b.lat;
        n += 1;
      });

      geometry.setDrawRange(0, n * 2);
      posAttr.needsUpdate = true;
      llAttr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
