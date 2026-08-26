/*
 * The constellation figures, so the real sky can be read rather than only looked at.
 *
 * The star field is genuine and that was half the job: 5,080 stars in their true places is a sky nobody
 * can find anything in, because finding things in a sky means knowing which dots belong together. The
 * lines are the other half. They are also the one layer here that is not a measurement of anything -
 * nobody discovered that those seven stars are a plough - which is why they are a toggle and not scenery.
 *
 * **Line endpoints as coordinates, not star identifiers.** Most asterism files list pairs of HIP catalogue
 * numbers, and the committed star table carries no identifiers at all: it is right ascension, declination
 * and magnitude, and adding a fourth column to join on would mean regenerating it and shipping the join.
 * A source that states where each line begins and ends needs no join, so that is the source used.
 *
 * **From d3-celestial, and the licence requires saying so.**
 *
 *   constellations.lines.json, from https://github.com/ofrohn/d3-celestial
 *   Copyright (c) 2015, Olaf Frohn. BSD 3-Clause.
 *
 * BSD 3-Clause asks that the copyright notice be retained and reproduced in the documentation, which is
 * what this block and the entry in README.md are for. The star positions themselves are not from here -
 * they come from the Yale catalogue via `make-stars.mjs` - so the lines are laid over stars from a
 * different source, and a line that ends a tenth of a degree off its star is invisible at this scale.
 *
 * **Polylines, not segments.** A figure like Orion is a run of joined points, and writing it as
 * independent segments duplicates every interior point. Stored one point per point and expanded to
 * segments at load, which is smaller on the wire and the same buffer either way.
 *
 * Committed script, committed output.
 *
 *   node tools/make-figures.mjs
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

/*
 * Two decimal places, matching the star table.
 *
 * A line is drawn to a star's position, so it can be no more precise than the star it points at, and
 * 0.01 degrees is 36 arcseconds either way.
 */
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
 * Orion's belt has to be in here somewhere, and this is the cheapest way to insist on it.
 *
 * Alnilam, the middle star of the belt, is at 84.05, -1.20. If the file were ever swapped for one in
 * hours of right ascension rather than degrees, every coordinate would still parse and every figure would
 * be squeezed into a twenty-fourth of the sky - which this catches and nothing else here would.
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
