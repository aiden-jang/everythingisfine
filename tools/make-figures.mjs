/*
 * The constellation figures. Committed script, committed output.
 *
 *   node tools/make-figures.mjs
 *
 * From d3-celestial, and the licence requires this notice be kept:
 *
 *   constellations.lines.json, from https://github.com/ofrohn/d3-celestial
 *   Copyright (c) 2015, Olaf Frohn. BSD 3-Clause.
 *
 * Line endpoints as coordinates, not star ids. Most asterism files list HIP numbers and the committed star
 * table carries no ids at all, so a source that states where each line starts and ends needs no join. The
 * lines therefore sit over stars from a different source; at this scale a tenth of a degree is invisible.
 *
 * Polylines, not segments: independent segments duplicate every interior point on the wire.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "geo", "figures.json");
const SRC = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json";

const response = await fetch(SRC);
if (!response.ok) throw new Error(`d3-celestial returned ${response.status}`);
const collection = await response.json();
if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("not the FeatureCollection this expects; the file's shape changed");
}

/* Two decimal places, matching the star table. A line is drawn to a star's position, so it can be no more
 * precise than the star it points at. */
const round = (v) => Number(v.toFixed(2));

const figures = [];
let segments = 0;
let widest = 0;
for (const feature of collection.features) {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== "MultiLineString") continue;
  for (const line of geometry.coordinates) {
    if (!Array.isArray(line) || line.length < 2) continue;
    const flat = [];
    for (const point of line) {
      const [ra, dec] = point;
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) {
        throw new Error(`${feature.id}: ${JSON.stringify(point)} is not a coordinate`);
      }
      flat.push(round(ra), round(dec));
    }
    figures.push(flat);
    segments += flat.length / 2 - 1;
    widest = Math.max(widest, flat.length / 2);
  }
}

if (figures.length < 100) throw new Error(`only ${figures.length} polylines; expected several hundred`);

/*
 * Orion's belt has to be in here somewhere, and this is the cheapest way to insist on it. Alnilam is at
 * 84.05, -1.20. Swapped for a file in hours of right ascension rather than degrees, every coordinate would
 * still parse and every figure would be squeezed into a twenty-fourth of the sky.
 */
const nearAlnilam = figures.some((flat) => {
  for (let i = 0; i < flat.length; i += 2) {
    if (Math.abs(flat[i] - 84.05) < 0.5 && Math.abs(flat[i + 1] + 1.2) < 0.5) return true;
  }
  return false;
});
if (!nearAlnilam) throw new Error("no line touches Alnilam; the coordinates are not degrees of RA and dec");

const json = JSON.stringify(figures);
await writeFile(OUT, `${json}\n`);
console.log(`${figures.length} polylines, ${segments} segments, longest run ${widest} points`);
console.log(`wrote ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
