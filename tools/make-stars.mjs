/*
 * The actual sky, so the field behind the planet is a place rather than a texture. Committed script,
 * committed output.
 *
 *   node tools/make-stars.mjs
 *
 * The Yale Bright Star Catalogue: 9,110 stars, J2000 positions, visual magnitudes.
 *
 * Cut at magnitude 6.0, which is 5,080 stars and the naked-eye limit rather than a tuned number. An earlier
 * cut took 5.5 to match the density of the procedural field it replaced, which was doing the renderer's job:
 * that belongs in the brightness ramp. Costs 88kB, 34kB over the wire, against 50kB and 20kB at 5.5.
 *
 * Degrees, not unit vectors: fewer digits for the same precision, and a table a person can check against a
 * star chart. Flat, not nested - 5,080 pairs of brackets is 10kB of punctuation.
 *
 * Not precessed. Precession moves a star 1.4 arcminutes a year, so a quarter century is under half a degree.
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
 * Fixed-width ASCII, and the byte offsets matter more than anything else in this file. BSC5 carries two
 * coordinate blocks per line: B1900 first, then J2000, and reading the wrong one puts every star about a
 * degree and a half out. Verified against Sirius, Polaris and Betelgeuse rather than trusted from the spec.
 */
const FIELD = {
  raH: [75, 2],
  raM: [77, 2],
  raS: [79, 4],
  decSign: [83, 1],
  decD: [84, 2],
  decM: [86, 2],
  decS: [88, 2],
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
  const dec =
    (at(line, FIELD.decSign) === "-" ? -1 : 1) *
    (Number(at(line, FIELD.decD)) + Number(at(line, FIELD.decM)) / 60 + Number(at(line, FIELD.decS)) / 3600);
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
console.log(
  `brightest: magnitude ${brightest.mag} at ${brightest.ra.toFixed(2)}, ${brightest.dec.toFixed(2)}`,
);
console.log(`wrote ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
