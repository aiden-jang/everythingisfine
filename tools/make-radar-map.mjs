import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import atlas from "world-atlas/land-50m.json" with { type: "json" };
import { regionalCoast } from "./regional-coast.mjs";

const bounds = { west: -127, south: 23, east: -64, north: 51 };
const url = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";
const response = await fetch(url);
if (!response.ok) throw new Error(`Could not load Census state boundaries: ${response.status}`);
const source = Buffer.from(await response.arrayBuffer());
if (
  createHash("sha256").update(source).digest("hex") !==
  "d76b391ccfa8bff601d51e3e3da5d43a89fa46cd5caca72ce731b383be5596d0"
)
  throw new Error("The boundary source revision changed");

const { arcs, transform } = JSON.parse(source);
const [sx, sy] = transform.scale;
const [x0, y0] = transform.translate;
const lines = [];
for (const arc of arcs) {
  let x = 0;
  let y = 0;
  let path = [];
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    const lon = x0 + x * sx;
    const lat = y0 + y * sy;
    if (lon < bounds.west - 1 || lon > bounds.east + 1 || lat < bounds.south - 1 || lat > bounds.north + 1) {
      if (path.length > 1) lines.push(path);
      path = [];
      continue;
    }
    const point = [Number(lon.toFixed(2)), Number(lat.toFixed(2))];
    if (point[0] !== path.at(-1)?.[0] || point[1] !== path.at(-1)?.[1]) path.push(point);
  }
  if (path.length > 1) lines.push(path);
}
const coast = regionalCoast(atlas, { west: -147, south: 10, east: -45, north: 74 }).map((polygon) =>
  polygon.map((ring) => ring.map((point) => point.map((value) => Number(value.toFixed(2))))),
);
const map = { coast, states: lines };
await writeFile(new URL("../src/app/radar/us-map.json", import.meta.url), JSON.stringify(map) + "\n");
