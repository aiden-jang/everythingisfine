import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import atlas from "world-atlas/land-50m.json" with { type: "json" };
import { regionalCoast } from "./regional-coast.mjs";

const source = "https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-092326.txt";
const checksum = "75202780ce56c8458f16fbef5fb8a026b99b00878dbb95c458211b3e6ef125b4";
const bytes = process.argv[2]
  ? await readFile(process.argv[2])
  : await fetch(source).then(async (response) => {
      if (!response.ok) throw new Error(`NOAA returned ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    });

if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
  throw new Error("Unexpected HURDAT2 revision");
}

const lines = bytes.toString().split(/\r?\n/);
const header = lines.findIndex((line) => line.startsWith("AL122005,"));
if (header < 0) throw new Error("Missing Katrina’s best track");
const count = Number(lines[header].split(",")[2]);
const coordinate = (value) => Number(value.slice(0, -1)) * (/[WS]$/.test(value) ? -1 : 1);
const track = [];
for (const line of lines.slice(header + 1, header + 1 + count)) {
  const fields = line.split(",").map((value) => value.trim());
  const [date, clock, flag, status, lat, lon, wind, pressure] = fields;
  const stamp = date + clock;
  if (stamp < "200508280000" || stamp > "200508291110") continue;
  if (status !== "HU") throw new Error(`Unexpected status ${status}`);
  const at = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${clock.slice(0, 2)}:${clock.slice(2)}:00Z`;
  const radii = (offset) => {
    const values = fields.slice(offset, offset + 4).map(Number);
    return values.some((value) => value < 0) ? null : values;
  };
  track.push({
    at,
    lat: coordinate(lat),
    lon: coordinate(lon),
    wind: Number(wind),
    pressure: Number(pressure),
    r34: radii(8),
    r64: radii(16),
    landfall: flag === "L",
  });
}
if (track.length !== 7 || !track.at(-1).landfall) throw new Error("Incomplete Gulf approach");

const coast = regionalCoast(atlas, { west: -132, east: -59, south: 3, north: 61 });
await writeFile(
  new URL("../src/app/storm/katrina.json", import.meta.url),
  JSON.stringify({ track, coast }) + "\n",
);
console.log(`Packed ${track.length} HURDAT2 fixes, ending at the Buras landfall.`);
