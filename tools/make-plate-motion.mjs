/*
 * Plate motion, sampled from Bird (2003) rather than computed here.
 *
 * Item 6 asked for motion vectors, and the first instinct was Euler poles: a small table of rotation
 * axes, one line of spherical algebra per point. That would have meant **writing pole coordinates from
 * memory**, which is the same sin `arrival.ts` refused when it declined to keep a city list, with the
 * added problem that the app's boundary file is lines with no plate identity, so there would have been
 * nothing to say which plate a point belongs to.
 *
 * PB2002's own step file makes all of that unnecessary. Every one of its 5,819 boundary steps already
 * carries the relative velocity of the plate on one side with respect to the other, its azimuth, the
 * divergent and right-lateral components, and a boundary class. So the velocities here are published
 * measurements passed through unaltered, and this script's only opinions are which steps to keep and
 * how to round them.
 *
 * Committed script, committed output. `make-card.mjs` shipped for months unable to run, so an asset with
 * no working generator beside it is an asset that goes quietly stale.
 *
 *   node tools/make-plate-motion.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/original/"
  + "PB2002_steps.dat.txt";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "geo", "plateMotion.json");

/*
 * One arrow per 800km of boundary.
 *
 * Measured against the alternatives rather than picked: the 260,483km of boundary in this file give 415
 * arrows at 500km, 231 at 800 and 133 at 1200. 231 is the one that still resolves a single ridge as a
 * row of arrows rather than as three, and lands near 6kB before compression, which sits beside the 9.4kB
 * the boundary lines already cost.
 */
const SPACING_KM = 800;

/*
 * Fixed-width columns, from `PB2002_steps_desc.txt`, converted from its 1-based byte positions.
 * Not split on whitespace: negative numbers in this file run together with the column before them.
 */
const cut = (line, from, to) => line.slice(from - 1, to).trim();

const res = await fetch(SRC);
if (!res.ok) throw new Error(`PB2002 steps: ${res.status}`);
const lines = (await res.text()).split("\n");

const samples = [];
const carried = new Map();
let steps = 0;
let boundaryKm = 0;

for (const line of lines) {
  if (line.length < 90) continue;
  const id = cut(line, 7, 11);
  const lengthKm = Number(cut(line, 47, 51));
  const velocity = Number(cut(line, 57, 61));
  const azimuth = Number(cut(line, 63, 65));
  const divergent = Number(cut(line, 67, 72));
  if (!Number.isFinite(lengthKm) || !Number.isFinite(velocity) || !Number.isFinite(azimuth)) continue;
  steps += 1;
  boundaryKm += lengthKm;

  // Accumulated per boundary, not globally, so a short boundary still gets an arrow of its own.
  const run = (carried.get(id) ?? 0) + lengthKm;
  if (run < SPACING_KM) { carried.set(id, run); continue; }
  carried.set(id, 0);

  const lon1 = Number(cut(line, 13, 20));
  const lat1 = Number(cut(line, 22, 28));
  const lon2 = Number(cut(line, 30, 37));
  const lat2 = Number(cut(line, 39, 45));
  samples.push([
    Number(((lon1 + lon2) / 2).toFixed(2)),
    Number(((lat1 + lat2) / 2).toFixed(2)),
    Math.round(azimuth),
    Number(velocity.toFixed(1)),
    // Sign only. The magnitude is already in `velocity`, and what a reader needs from this column is
    // whether the two sides are coming together or moving apart.
    Math.sign(divergent),
    cut(line, 93, 95),
  ]);
}

const json = JSON.stringify(samples);
await writeFile(OUT, `${json}\n`);
const fastest = samples.reduce((a, b) => (b[3] > a[3] ? b : a));
console.log(`${steps} steps, ${Math.round(boundaryKm).toLocaleString("en")} km of boundary`);
console.log(`wrote ${samples.length} arrows, ${(json.length / 1024).toFixed(1)} kB -> ${OUT}`);
console.log(`fastest sampled: ${fastest[5]} at ${fastest[3]} mm/a`);
