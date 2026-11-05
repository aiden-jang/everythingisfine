import { feature } from "topojson-client";

const round = (value) => Number(value.toFixed(4));

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

export function regionalCoast(atlas, { west, east, south, north }) {
  return feature(atlas, atlas.objects.land)
    .features.flatMap(({ geometry }) =>
      geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates],
    )
    .map((rings) =>
      rings
        .map((ring) => {
          const left = crop(ring, 0, west, (lon) => lon >= west);
          const right = crop(left, 0, east, (lon) => lon <= east);
          const bottom = crop(right, 1, south, (lat) => lat >= south);
          const top = crop(bottom, 1, north, (lat) => lat <= north);
          return top.map((point) => point.map(round));
        })
        .filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length);
}
