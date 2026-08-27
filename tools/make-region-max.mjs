/*
 * The largest earthquake each region has had this century, so today's largest has something to stand next to.
 * Committed script, committed output.
 *
 *   node tools/make-region-max.mjs
 *
 * Magnitude 6 and up, chosen to sit safely below every answer: no region on this list has gone a quarter
 * century without a 6, and a lower threshold would be 12,628 events instead of 3,815 for the same eleven
 * numbers.
 *
 * From 2000, and the copy says "since at least". The catalogue reaches further back and the query does not,
 * so a region's true maximum may be older and larger - Valdivia is not in here.
 *
 * Regions come from `regions.ts`, not from here: a second set of bounds would put a sentence about one region
 * beside a count of another.
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIN_MAGNITUDE = 6;
const START = "2000-01-01";
const END = "2025-08-01";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "app", "regionMax.json");
const SRC = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv"
  + `&minmagnitude=${MIN_MAGNITUDE}&starttime=${START}&endtime=${END}`;

/* The region boxes, read out of the TypeScript rather than copied. A duplicated table drifts silently:
 * nothing would fail, the sentences would simply start describing boxes the rail no longer counts by. */
const source = await readFile(join(here, "..", "src", "app", "regions.ts"), "utf8");
const regions = [...source.matchAll(
  /\{\s*name:\s*"([^"]+)",\s*lon:\s*[-\d.]+,\s*lat:\s*[-\d.]+,\s*bounds:\s*\[([-\d.,\s]+)\]/g,
)].map((m) => {
  const [w, s, e, n] = m[2].split(",").map((v) => Number(v.trim()));
  return { name: m[1], w, s, e, n };
});
if (regions.length < 5) throw new Error(`only parsed ${regions.length} regions; the shape changed`);

/** Straddling boxes have west > east, so the test splits rather than compares. Mirrors `contains`. */
const inside = (r, lon, lat) => {
  if (lat < r.s || lat > r.n) return false;
  return r.w <= r.e ? lon >= r.w && lon <= r.e : lon >= r.w || lon <= r.e;
};

const response = await fetch(SRC);
if (!response.ok) throw new Error(`USGS returned ${response.status}`);
const lines = (await response.text()).trim().split("\n");
const header = lines[0].split(",");
const iTime = header.indexOf("time");
const iLat = header.indexOf("latitude");
const iLon = header.indexOf("longitude");
const iMag = header.indexOf("mag");
if (Math.min(iTime, iLat, iLon, iMag) < 0) throw new Error("USGS csv is missing a column");

const best = new Map();
let rows = 0;
for (const line of lines.slice(1)) {
  const cell = line.split(",");
  const lat = Number(cell[iLat]);
  const lon = Number(cell[iLon]);
  const mag = Number(cell[iMag]);
  const day = cell[iTime]?.slice(0, 10);
  if (![lat, lon, mag].every(Number.isFinite) || !day) continue;
  rows += 1;
  for (const r of regions) {
    if (!inside(r, lon, lat)) continue;
    // Regions overlap by design, so one event can be the record holder for more than one of them.
    const held = best.get(r.name);
    if (!held || mag > held[0]) best.set(r.name, [Number(mag.toFixed(1)), day]);
  }
}

const table = Object.fromEntries([...best.entries()].sort((a, b) => b[1][0] - a[1][0]));
const json = JSON.stringify(table, null, 1);
await writeFile(OUT, `${json}\n`);
console.log(`${rows} events, ${regions.length} regions, ${Object.keys(table).length} with a record`);
for (const [name, [mag, day]] of Object.entries(table)) console.log(`  ${name}: M${mag} on ${day}`);
console.log(`wrote ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
