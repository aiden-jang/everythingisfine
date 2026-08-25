/*
 * Deep seismicity, so the slab has enough events to be a shape.
 *
 * Markers are drawn at their own depth, which is correct and, on live data, almost invisible. Measured
 * against a real USGS day: 237 events, 14 of them between 70 and 300km and **exactly two** below 300.
 * The subducting plate those two belong to is a surface a hundred kilometres thick and seven hundred
 * deep, and no single day will ever draw it. The scatter needs years.
 *
 * So the shape comes from the catalogue instead. Five years of magnitude 4.5 and deeper than 300km is
 * one query, and it is the same `fdsnws` endpoint the archive already reads, keyless and CORS-open.
 *
 * **Generated rather than fetched at runtime, and the reason is what it is for.** A live layer would put
 * 294kB on the wire to draw something that does not change: this is where the world's slabs are, not what
 * happened today. Baked, it is a code-split chunk of numbers that costs nothing until somebody asks, the
 * same arrangement `plateMotion.json` has for the same reason.
 *
 * **Deeper than 300km, which is a choice about honesty rather than about looks.** Shallow seismicity is
 * everywhere and would draw a crust, not a slab; below 300 the only thing that produces earthquakes is a
 * subducted plate, so every point here is on one. And the app already treats 300 as where deep begins -
 * `DEPTH_DEEP_KM` - so the layer starts where the marker's own hole stops widening.
 *
 * **M4.5, because that is where the global catalogue is complete.** Below it, detection depends on how
 * many seismometers happen to be nearby, so a lower threshold would draw instrument coverage as though
 * it were geology: dense under Japan, thin under Tonga, for reasons that are about funding.
 *
 * Committed script, committed output, same as its neighbour.
 *
 *   node tools/make-slab.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Deeper than this and only a subducted plate can be doing it. Matches `DEPTH_DEEP_KM`. */
const MIN_DEPTH_KM = 300;
/** Where the global catalogue stops depending on how many instruments are nearby. */
const MIN_MAGNITUDE = 4.5;
const START = "2020-08-01";
const END = "2025-08-01";

const SRC = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv"
  + `&minmagnitude=${MIN_MAGNITUDE}&mindepth=${MIN_DEPTH_KM}`
  + `&starttime=${START}&endtime=${END}`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "geo", "slab.json");

const response = await fetch(SRC);
if (!response.ok) throw new Error(`USGS returned ${response.status}`);
const csv = await response.text();

/*
 * Split on the header rather than on a column count.
 *
 * The `place` field is quoted and contains commas ("8 km N of Toba, Japan"), so a naive split gives a
 * different number of columns for different rows. Everything wanted here is left of that field, so the
 * row is cut at the first four commas and the rest is discarded unparsed.
 */
const lines = csv.trim().split("\n");
const header = lines[0].split(",");
const at = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`USGS csv has no ${name} column`);
  return i;
};
const iLat = at("latitude");
const iLon = at("longitude");
const iDepth = at("depth");
const iMag = at("mag");

const points = [];
let skipped = 0;
for (const line of lines.slice(1)) {
  const cell = line.split(",", Math.max(iLat, iLon, iDepth, iMag) + 1);
  const lat = Number(cell[iLat]);
  const lon = Number(cell[iLon]);
  const depth = Number(cell[iDepth]);
  const mag = Number(cell[iMag]);
  if (![lat, lon, depth, mag].every(Number.isFinite) || depth < MIN_DEPTH_KM) {
    skipped += 1;
    continue;
  }
  /*
   * Two decimals of position is about a kilometre, which is finer than the catalogue's own location
   * error at these depths, and depth is rounded to the kilometre for the same reason. Carrying the
   * feed's five decimals would be three times the bytes to state a precision nobody has.
   */
  points.push([
    Number(lon.toFixed(2)),
    Number(lat.toFixed(2)),
    Math.round(depth),
    Number(mag.toFixed(1)),
  ]);
}

const json = JSON.stringify(points);
await writeFile(OUT, `${json}\n`);
const deepest = points.reduce((a, b) => (b[2] > a[2] ? b : a));
console.log(`${lines.length - 1} rows, ${skipped} skipped`);
console.log(`wrote ${points.length} events, ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
console.log(`deepest: ${deepest[2]} km, M${deepest[3]} at ${deepest[0]}, ${deepest[1]}`);
