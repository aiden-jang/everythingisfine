/*
 * Deep seismicity, so the slab has enough events to be a shape. Committed script, committed output.
 *
 *   node tools/make-slab.mjs
 *
 * A real USGS day has 237 events, 14 between 70 and 300km and exactly two below 300. The plate those two
 * belong to reaches seven hundred kilometres down, and no single day will ever draw it.
 *
 * Generated, not fetched at runtime: a live layer would put 294kB on the wire to draw something that does not
 * change. Baked, it is a chunk that costs nothing until somebody asks.
 *
 * Deeper than 300km, because below that only a subducted plate makes earthquakes. M4.5, because that is where
 * the catalogue is complete - lower, and the layer draws instrument coverage as though it were geology.
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
 * Split on the header rather than on a column count. The `place` field is quoted and contains commas
 * ("8 km N of Toba, Japan"), so a naive split gives a different number of columns for different rows.
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
  // Two decimals of position is about a kilometre, finer than the catalogue's own location error at these
  // depths. The feed's five decimals would be three times the bytes to state a precision nobody has.
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
