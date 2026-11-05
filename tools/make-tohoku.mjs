// Pack the two versioned USGS products and Natural Earth coastlines for the on-demand archive scene.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { regionalCoast } from "./regional-coast.mjs";
import atlas from "world-atlas/land-50m.json" with { type: "json" };

const USGS = "https://earthquake.usgs.gov/product/";
const model = "finite-fault/usp000hvnu/us/1539808472261/FFM.geojson";
const shakeMap = "shakemap/official20110311054624120_30/atlas/1594161746661/download/cont_mmi.json";

async function readProduct(path, checksum, localFile) {
  const bytes = localFile
    ? await readFile(localFile)
    : await fetch(USGS + path).then(async (response) => {
        if (!response.ok) throw new Error(`USGS returned ${response.status} for ${path}`);
        return Buffer.from(await response.arrayBuffer());
      });
  if (createHash("sha256").update(bytes).digest("base64") !== checksum) {
    throw new Error(`Unexpected revision of ${path}`);
  }
  return JSON.parse(bytes.toString());
}

const [fault, shaking] = await Promise.all([
  readProduct(model, "XXaIbNBpn0KG7018G98AHb2imp1oLvoUD5bhMQCmnEU=", process.argv[2]),
  readProduct(shakeMap, "JAvnk62TeaqqvX5oXMfaHy5Q0yDNbNYNq8BxIIY3k0Q=", process.argv[3]),
]);

const round = (value) => Number(value.toFixed(4));
const mesh = fault.features.map(({ properties: { slip, trup, rise }, geometry }) => ({
  slip,
  start: trup,
  rise,
  corners: geometry.coordinates[0].slice(0, -1).map(([lon, lat, metres]) => [lon, lat, round(metres / 1000)]),
}));
const contours = shaking.features.map(({ properties: { value, color }, geometry }) => ({
  mmi: value,
  color,
  lines: geometry.coordinates.map((line) => line.map((point) => point.map(round))),
}));

const coast = regionalCoast(atlas, { west: 128, east: 154, south: 28, north: 48 });

const packed = {
  coast,
  mesh,
  contours,
  origin: [142.373, 38.297, 29],
  hypocenter: [fault.metadata.epicenter.lon, fault.metadata.epicenter.lat, fault.metadata.epicenter.depth],
};
await writeFile(new URL("../src/app/rupture/tohoku.json", import.meta.url), JSON.stringify(packed) + "\n");
console.log(
  `Packed ${mesh.length} rupture patches, ${contours.length} contour levels and ${coast.length} coastline polygons.`,
);
