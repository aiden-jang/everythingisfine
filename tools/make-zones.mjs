/*
 * Where a timezone is, so the app can say where the nearest earthquake was from.
 *
 * Every other number in this app is about the planet. None of them are about the person reading, and
 * "340 km away" is the one fact that turns a dot in the Pacific into something that happened near
 * somewhere you know.
 *
 * **Nothing is asked and nothing leaves the browser.** `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * is already available to any page without a prompt, and it is the only input: no geolocation dialog, no
 * IP lookup, no request to a third party, and no key - which is the same constraint every feed here is
 * under. The lookup happens against a table shipped with the app.
 *
 * **A zone is a region, so the app names the city rather than the reader.** This is the honesty question
 * the feature turns on. `Asia/Shanghai` covers the whole of China, so someone in Kashgar is three
 * thousand kilometres from the coordinate on that row. Saying "340 km from you" would therefore be a
 * confident claim about a person, made from a value that only ever described a reference point. Saying
 * "340 km from Shanghai" is true whoever is reading, and for most readers it is still their own city.
 *
 * **The coordinates are IANA's, not ours.** `arrival.ts` refused to keep an authored list of cities on
 * the grounds that writing latitudes from memory means making confident claims about real towns from
 * them. This is that same list, except tzdb maintains it and this script only reparses and rounds. The
 * file is public domain and the canonical source for exactly this mapping.
 *
 * **Both tables, because the newer one is deliberately smaller.** `zone1970.tab` lists only zones whose
 * civil timestamps have agreed since 1970, which drops 106 zones a browser may still report -
 * `Africa/Nairobi` and `Africa/Accra` among them. The older `zone.tab` carries those, so the two are
 * merged with the modern file winning any overlap.
 *
 * Committed script, committed output.
 *
 *   node tools/make-zones.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://raw.githubusercontent.com/eggert/tz/main/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "zones.json");

/**
 * ISO 6709 as tzdb writes it: a sign, degrees, minutes, and sometimes seconds, all run together.
 *
 * Latitude takes two digits of degrees and longitude three, which is the only thing separating
 * `+4042-07400` into 40°42'N 74°00'W rather than something else. Parsed by width rather than by
 * separator because there is no separator.
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
