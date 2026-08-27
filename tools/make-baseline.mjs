/*
 * How busy a day is, against five years of days. Committed script, committed output.
 *
 *   node tools/make-baseline.mjs
 *
 * Magnitude 4.5, and that threshold is the whole argument: detection depends on how many seismometers are
 * nearby, so a count of everything cannot be compared across years. At 4.5 the catalogue is complete.
 *
 * Calendar days in UTC, matching the app's archive. A rolling window would overlap every day with its
 * neighbours and flatten the distribution.
 *
 * Paged by year: five years at this threshold is 38,289 events against a hard limit of 20,000 per query,
 * which returns a 400 rather than a truncated list.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Where the global catalogue stops depending on how many instruments are nearby. */
const MIN_MAGNITUDE = 4.5;
const START = "2020-08-01";
const END = "2025-08-01";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "baseline.json");
const DAY_MS = 86_400_000;

const url = (from, to) => "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv"
  + `&minmagnitude=${MIN_MAGNITUDE}&starttime=${from}&endtime=${to}`;

/** One bucket per UTC calendar day, so a day with nothing in it still counts as a day. */
const byDay = new Map();
for (let at = Date.parse(`${START}T00:00:00Z`); at < Date.parse(`${END}T00:00:00Z`); at += DAY_MS) {
  byDay.set(new Date(at).toISOString().slice(0, 10), 0);
}

let total = 0;
let outside = 0;
for (let year = Number(START.slice(0, 4)); year <= Number(END.slice(0, 4)); year += 1) {
  const from = year === Number(START.slice(0, 4)) ? START : `${year}-01-01`;
  const to = year === Number(END.slice(0, 4)) ? END : `${year + 1}-01-01`;
  if (Date.parse(from) >= Date.parse(to)) continue;

  const response = await fetch(url(from, to));
  if (!response.ok) throw new Error(`USGS returned ${response.status} for ${from}..${to}`);
  const lines = (await response.text()).trim().split("\n");
  const iTime = lines[0].split(",").indexOf("time");
  if (iTime < 0) throw new Error("USGS csv has no time column");

  let kept = 0;
  for (const line of lines.slice(1)) {
    const day = line.split(",")[iTime]?.slice(0, 10);
    if (day === undefined) continue;
    if (!byDay.has(day)) {
      // The API's range is inclusive at both ends, so the seam between two pages can hand back a day
      // belonging to the next one. Counted rather than silently dropped, so a real gap is visible.
      outside += 1;
      continue;
    }
    byDay.set(day, byDay.get(day) + 1);
    kept += 1;
  }
  total += kept;
  console.log(`${from}..${to}: ${lines.length - 1} rows, ${kept} inside the span`);
}

/*
 * Sorted, and that is the whole data structure. The app asks one question - what share of days were busier -
 * and a sorted list answers it with a binary search. Percentiles would round the answer for a day sitting
 * between two of them.
 */
const counts = [...byDay.values()].sort((a, b) => a - b);
const json = JSON.stringify(counts);
await writeFile(OUT, `${json}\n`);

const median = counts[Math.floor(counts.length / 2)];
console.log(`${total} events over ${counts.length} days, ${outside} outside the span`);
console.log(`wrote ${counts.length} daily counts, ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
console.log(`quietest ${counts[0]}, median ${median}, busiest ${counts[counts.length - 1]}`);
