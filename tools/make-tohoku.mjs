// Pack the two versioned USGS products and Natural Earth coastlines for the on-demand archive scene.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { feature } from "topojson-client";
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

// Crop rings at the viewing bounds to avoid shipping the full regional basemap.
function crop(ring, axis, boundary, inside) {
  const result = [];
  let prev = ring.at(-1);
  for (const point of ring) {
    if (inside(prev[axis]) !== inside(point[axis])) {
      const t = (boundary - prev[axis]) / (point[axis] - prev[axis]);
      result.push(prev.map((value, i) => (i === axis ? boundary : value + (point[i] - value) * t)));
    }
    if (inside(point[axis])) result.push(point);
    prev = point;
  }
  return result;
}

const coast = feature(atlas, atlas.objects.land)
  .features.flatMap(({ geometry }) =>
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates],
  )
  .map((rings) =>
    rings
      .map((ring) => {
        const west = crop(ring, 0, 128, (lon) => lon >= 128);
        const east = crop(west, 0, 154, (lon) => lon <= 154);
        const south = crop(east, 1, 28, (lat) => lat >= 28);
        const north = crop(south, 1, 48, (lat) => lat <= 48);
        return north.map((point) => point.map(round));
      })
      .filter((ring) => ring.length >= 3),
  )
  .filter((polygon) => polygon.length);

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
