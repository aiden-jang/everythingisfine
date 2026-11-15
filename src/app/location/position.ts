import type { Permalink } from "../permalink";

export interface CoarsePosition {
  lon: number;
  lat: number;
}

export function coarsePosition(value: unknown): CoarsePosition | null {
  if (!value || typeof value !== "object") return null;
  const { lon, lat } = value as Partial<CoarsePosition>;
  if (
    typeof lon !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90
  )
    return null;
  return { lon: Math.round(lon * 10) / 10, lat: Math.round(lat * 10) / 10 };
}

export function mayLocateInitially(shared: Partial<Permalink>): boolean {
  return ![
    shared.lon,
    shared.lat,
    shared.zoom,
    shared.story,
    shared.scene,
    shared.event,
    shared.mark,
    shared.day,
    shared.catalogue,
    shared.section,
    shared.cursor,
  ].some((value) => value !== undefined && value !== null);
}
