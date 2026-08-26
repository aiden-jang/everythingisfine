/*
 * The actual sky, so the field behind the planet is a place rather than a texture.
 *
 * The procedural field this replaces was tuned and looked right, and it could never be recognised. A
 * reader who knows Orion could not find Orion, and the one thing a sky is for is telling you where you
 * are looking. This is the Yale Bright Star Catalogue, which is the canonical naked-eye catalogue and has
 * been since 1964: 9,110 stars, positions at J2000, visual magnitudes.
 *
 * **Magnitude 6.0 and brighter, which is 5,080 of them, and it is the naked-eye limit rather than a
 * tuned number.** An earlier cut took 5.5 on the argument that it matched the density of the procedural
 * field, and that reasoning was doing the renderer's job: the count in a patch of sky was already about
 * right at 5.5, and what was missing was the size the faint end was drawn at. So the catalogue limit is
 * now the physical fact - 6.0 is roughly what an unaided eye reaches on a good night - and matching the
 * weight of the old field is left to the brightness ramp in `starfield.ts`, where it belongs. It also
 * buys a sky of many small stars rather than fewer large ones, which is what a real one looks like.
 *
 * The cost is 88kB of numbers, 34kB over the wire, against 50kB and 20kB at 5.5.
 *
 * **Degrees, not unit vectors.** Same three numbers either way, but degrees need fewer digits for the
 * same angular precision, and a table of degrees can be checked against a star chart by eye. Two decimal
 * places is 36 arcseconds, which is far below anything a background sky can show.
 *
 * **Flat, not nested.** `[ra, dec, mag, ra, dec, mag, ...]` rather than an array of triples, because
 * 5,080 pairs of brackets is 10kB of punctuation.
 *
 * Positions are J2000 and are not precessed to the current epoch. Precession moves a star by about 1.4
 * arcminutes a year, so a quarter century of it is under half a degree: below this table's own rounding
 * as far as anything on screen is concerned, and the catalogue's own frame is the one every star chart
 * a reader might compare against also uses.
 *
 * Committed script, committed output.
 *
 *   node tools/make-stars.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

/** Roughly what an unaided eye reaches on a good night. See above. */
const MAG_LIMIT = 6.0;

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "geo", "stars.json");
const SRC = "http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz";

/*
 * Fixed-width ASCII, and the byte offsets matter more than anything else in this file.
 *
 * BSC5 carries two coordinate blocks per line: B1900 first, then J2000. Reading the wrong one puts every
 * star about a degree and a half out, which on a background sky is invisible until somebody who knows the
 * sky looks at it. Verified against three stars whose numbers are known by heart rather than trusted from
 * the spec: Sirius at 06h45m08.9s -16d42m58s magnitude -1.46, Polaris at 02h31m48.7s +89d15m51s
 * magnitude 2.02, and Betelgeuse at 05h55m10.3s +07d24m26s.
 */
const FIELD = {
  raH: [75, 2], raM: [77, 2], raS: [79, 4],
  decSign: [83, 1], decD: [84, 2], decM: [86, 2], decS: [88, 2],
  vmag: [102, 5],
};
const at = (line, [start, width]) => line.slice(start, start + width);

const response = await fetch(SRC);
if (!response.ok) throw new Error(`Harvard returned ${response.status}`);
const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("latin1");
const lines = text.split("\n");

const flat = [];
let skipped = 0;
let brightest = { mag: 99 };
for (const line of lines) {
  if (line.length < 107) continue;
  const raH = Number(at(line, FIELD.raH));
  const mag = Number(at(line, FIELD.vmag));
  // Novae and a handful of deleted entries carry a name and no position.
  if (!Number.isFinite(raH) || at(line, FIELD.raH).trim() === "" || !Number.isFinite(mag)) {
    skipped += 1;
    continue;
  }
  if (mag > MAG_LIMIT) continue;

  const ra = (raH + Number(at(line, FIELD.raM)) / 60 + Number(at(line, FIELD.raS)) / 3600) * 15;
  const dec = (at(line, FIELD.decSign) === "-" ? -1 : 1) * (
    Number(at(line, FIELD.decD))
    + Number(at(line, FIELD.decM)) / 60
    + Number(at(line, FIELD.decS)) / 3600
  );
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) {
    skipped += 1;
    continue;
  }
  flat.push(Number(ra.toFixed(2)), Number(dec.toFixed(2)), Number(mag.toFixed(2)));
  if (mag < brightest.mag) brightest = { mag, ra, dec };
}

const count = flat.length / 3;
if (count < 4_000 || count > 6_500) throw new Error(`${count} stars, which is not the expected 5,080`);
// Sirius is the brightest star in the sky and must come out of any correct parse of this catalogue.
if (Math.abs(brightest.ra - 101.29) > 0.05 || Math.abs(brightest.dec + 16.72) > 0.05) {
  throw new Error(`brightest star at ${brightest.ra}, ${brightest.dec}; expected Sirius at 101.29, -16.72`);
}

const json = JSON.stringify(flat);
await writeFile(OUT, `${json}\n`);
console.log(`${count} stars to magnitude ${MAG_LIMIT}, ${skipped} without a usable position`);
console.log(`brightest: magnitude ${brightest.mag} at ${brightest.ra.toFixed(2)}, ${brightest.dec.toFixed(2)}`);
console.log(`wrote ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
