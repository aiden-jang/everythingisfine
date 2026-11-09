import { DEG } from "../../geo/sphere";
import type { GeoPoint, ObservationRaster } from "./types";

export function pointOnEarth([x, y, z]: readonly [number, number, number]): GeoPoint {
  return { lon: Math.atan2(x, z) / DEG, lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG };
}

export function destination(lon: number, lat: number, angle: number, bearing: number): GeoPoint {
  const phi = lat * DEG;
  const sinLat = Math.sin(phi) * Math.cos(angle) + Math.cos(phi) * Math.sin(angle) * Math.cos(bearing);
  const turn = Math.atan2(
    Math.sin(bearing) * Math.sin(angle) * Math.cos(phi),
    Math.cos(angle) - Math.sin(phi) * sinLat,
  );
  return {
    lon: ((lon + turn / DEG + 540) % 360) - 180,
    lat: Math.asin(Math.max(-1, Math.min(1, sinLat))) / DEG,
  };
}

export function coastRaster(
  polygons: readonly (readonly (readonly GeoPoint[])[])[],
  bounds: NonNullable<ObservationRaster["bounds"]>,
): ObservationRaster {
  const [west, south, east, north] = bounds;
  const width = east - west;
  const height = north - south;
  const outline = polygons
    .flatMap((polygon) =>
      polygon.map(
        (ring) =>
          ring
            .map(({ lon, lat }, index) => `${index ? "L" : "M"}${lon.toFixed(4)},${(-lat).toFixed(4)}`)
            .join("") + "Z",
      ),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" preserveAspectRatio="none" viewBox="${west} ${-north} ${width} ${height}">
    <defs><radialGradient id="edge" r="69%"><stop offset="63%" stop-color="white"/><stop offset="100%" stop-color="black"/></radialGradient>
    <mask id="blend"><rect x="${west}" y="${-north}" width="${width}" height="${height}" fill="url(#edge)"/></mask></defs>
    <g mask="url(#blend)"><rect x="${west}" y="${-north}" width="${width}" height="${height}" fill="#0d1d2e"/>
    <path d="${outline}" fill="#20384c" fill-rule="evenodd" stroke="#617f96" stroke-width="0.035"/></g></svg>`;
  return { bounds, url: `data:image/svg+xml,${encodeURIComponent(svg)}`, opacity: 0.97 };
}
