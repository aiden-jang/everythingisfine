/*
 * Where a timezone is, so the app can say how far the nearest earthquake was. Committed script, committed
 * output.
 *
 *   node tools/make-zones.mjs
 *
 * Nothing is asked and nothing leaves the browser. `Intl.DateTimeFormat().resolvedOptions().timeZone` is the
 * only input, and it is already available to any page without a prompt.
 *
 * A zone is a region, so the app names the city rather than the reader. `Asia/Shanghai` covers the whole of
 * China, so "340 km from you" would be a confident claim about a person made from a reference point.
 *
 * The coordinates are IANA's, not ours: tzdb maintains this list and this script only reparses and rounds.
 *
 * Both tables, because the newer one is deliberately smaller. `zone1970.tab` lists only zones whose civil
 * timestamps have agreed since 1970, which drops 106 zones a browser may still report - `Africa/Nairobi`
 * among them - so the older `zone.tab` is merged in with the modern file winning any overlap.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://raw.githubusercontent.com/eggert/tz/main/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "zones.json");

/**
 * ISO 6709 as tzdb writes it: a sign, degrees, minutes, and sometimes seconds, all run together. Latitude
 * takes two digits of degrees and longitude three, which is the only thing separating `+4042-07400` into
 * 40°42'N 74°00'W. Parsed by width because there is no separator.
 */
function parseIso6709(text) {
  const match = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/.exec(text);
  if (!match) return null;
  const [, latSign, latDeg, latMin, latSec, lonSign, lonDeg, lonMin, lonSec] = match;
  const lat = (Number(latDeg) + Number(latMin) / 60 + Number(latSec ?? 0) / 3600)
    * (latSign === "-" ? -1 : 1);
  const lon = (Number(lonDeg) + Number(lonMin) / 60 + Number(lonSec ?? 0) / 3600)
    * (lonSign === "-" ? -1 : 1);
  return [Number(lon.toFixed(2)), Number(lat.toFixed(2))];
}

async function rows(file) {
  const response = await fetch(BASE + file);
  if (!response.ok) throw new Error(`tzdb returned ${response.status} for ${file}`);
  const out = [];
  for (const line of (await response.text()).split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const cell = line.split("\t");
    const at = parseIso6709(cell[1] ?? "");
    const zone = cell[2];
    if (at === null || !zone) continue;
    out.push([zone, at]);
  }
  return out;
}

// Legacy first, so the modern file overwrites anything the two disagree about.
const legacy = await rows("zone.tab");
const modern = await rows("zone1970.tab");
const zones = Object.fromEntries([...legacy, ...modern]);

const json = JSON.stringify(zones);
await writeFile(OUT, `${json}\n`);
console.log(`${legacy.length} legacy rows, ${modern.length} modern rows`);
console.log(`wrote ${Object.keys(zones).length} zones, ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
console.log(`spot check: Australia/Sydney ${zones["Australia/Sydney"]}, `
  + `America/New_York ${zones["America/New_York"]}`);
