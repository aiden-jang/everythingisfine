export const RADAR_SERVICE =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer";
const WINDOW = 60 * 60_000;
const MAX_SCANS = 13;
export const RADAR_BOUNDS = [-127, 23, -64, 51] as const;

export interface RadarScan {
  id: number;
  at: number;
  path?: string;
}

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function radarScans(data: unknown, now: number): RadarScan[] {
  const features = record(data)?.["features"];
  if (!Array.isArray(features)) throw new Error("Unexpected NOAA radar catalogue");
  const seen = new Map<number, RadarScan>();
  for (const feature of features) {
    const attributes = record(record(feature)?.["attributes"]);
    const id = attributes?.["objectid"];
    const at = attributes?.["idp_validtime"];
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      typeof at !== "number" ||
      !Number.isSafeInteger(at) ||
      at < 1 ||
      at > now + 60_000
    )
      continue;
    const earlier = seen.get(at);
    if (!earlier || id > earlier.id) seen.set(at, { id, at });
  }
  const ordered = Array.from(seen.values()).sort((a, b) => a.at - b.at);
  const cutoff = (ordered.at(-1)?.at ?? now) - WINDOW;
  return ordered.filter(({ at }) => at >= cutoff).slice(-MAX_SCANS);
}

export function radarCatalogUrl() {
  const params = new URLSearchParams({
    where: "category=1 AND idp_subset='CONUS'",
    outFields: "objectid,idp_validtime",
    returnGeometry: "false",
    orderByFields: "idp_validtime DESC",
    resultRecordCount: String(MAX_SCANS * 2),
    f: "json",
  });
  return `${RADAR_SERVICE}/query?${params}`;
}

export function radarImageUrl(id: number) {
  const params = new URLSearchParams({
    bbox: RADAR_BOUNDS.join(","),
    bboxSR: "4326",
    imageSR: "4326",
    size: "1134,504",
    format: "png32",
    transparent: "true",
    adjustAspectRatio: "false",
    interpolation: "RSP_NearestNeighbor",
    mosaicRule: JSON.stringify({ mosaicMethod: "esriMosaicLockRaster", lockRasterIds: [id] }),
    f: "image",
  });
  return `${RADAR_SERVICE}/exportImage?${params}`;
}
