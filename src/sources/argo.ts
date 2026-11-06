export const ARGO_DOI = "https://doi.org/10.17882/42182";
export const ARGO_PROVIDER = "https://erddap.marine.ie/erddap/info/argoFloats/";
const TABLE = "https://erddap.marine.ie/erddap/tabledap/argoFloats.json";

export interface ArgoStation {
  id: string;
  wmo: string;
  cycle: number;
  at: number;
  lat: number;
  lon: number;
  mode: "R" | "A" | "D";
}

export interface ArgoSample {
  pressure: number;
  temperature: number;
  salinity: number;
  depth: number;
}

export interface ArgoProfile extends ArgoStation {
  samples: readonly ArgoSample[];
}

type Measurement = readonly [pressure: number, temperature: number, salinity: number];

const catalogueFields = "platform_number,cycle_number,time,latitude,longitude,data_mode,profile_psal_qc";
const profileFields = [
  "pres,temp,psal,pres_qc,temp_qc,psal_qc",
  "pres_adjusted,temp_adjusted,psal_adjusted,pres_adjusted_qc,temp_adjusted_qc,psal_adjusted_qc",
].join(",");

function tableUrl(fields: string, constraints: string[]) {
  return `${TABLE}?${fields}&${constraints.map(encodeURIComponent).join("&")}`;
}

export const argoCatalogueUrl = () =>
  tableUrl(catalogueFields, [
    "time>=now-45d",
    "time<=now",
    "pres>=0",
    "pres<=12",
    'direction="A"',
    'position_qc="1"',
    "distinct()",
  ]);

export function argoProfileUrl(station: ArgoStation) {
  const time = new Date(station.at).toISOString().replace(".000Z", "Z");
  return tableUrl(profileFields, [
    `platform_number="${station.wmo}"`,
    `cycle_number=${station.cycle}`,
    `time="${time}"`,
    'direction="A"',
  ]);
}

function rows(input: unknown): unknown[][] {
  const table = (input as { table?: { rows?: unknown } } | null)?.table;
  if (!Array.isArray(table?.rows)) throw new Error("Unexpected Argo response");
  return table.rows.filter(Array.isArray);
}

const valid = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function argoStation(row: readonly unknown[]): ArgoStation | null {
  const [wmo, cycle, time, lat, lon, mode] = row;
  const at = typeof time === "string" ? Date.parse(time) : NaN;
  if (
    typeof wmo !== "string" ||
    !/^\d{5,8}$/.test(wmo) ||
    !valid(cycle, 0, 10_000) ||
    !Number.isInteger(cycle) ||
    !Number.isFinite(at) ||
    !valid(lat, -85, 85) ||
    !valid(lon, -180, 180) ||
    (mode !== "R" && mode !== "A" && mode !== "D")
  )
    return null;
  return { id: `${wmo}/${cycle}/${at}`, wmo, cycle, at, lat, lon, mode };
}

export function argoCatalogue(input: unknown, now = Date.now()): ArgoStation[] {
  const found = new Map<string, ArgoStation>();
  for (const row of rows(input)) {
    if (!["A", "B", "C", "D"].includes(String(row[6]))) continue;
    const station = argoStation(row);
    if (station && station.at <= now) found.set(station.id, station);
  }
  return [...found.values()].sort((a, b) => b.at - a.at).slice(0, 10);
}

export function depthFromPressure(pressure: number, latitude: number): number {
  const sin2 = Math.sin((latitude * Math.PI) / 180) ** 2;
  const gravity = 9.780318 * (1 + (0.0052788 + 0.0000236 * sin2) * sin2) + 0.000001092 * pressure;
  const p = pressure;
  return ((((-1.82e-15 * p + 2.279e-10) * p - 2.2512e-5) * p + 9.72659) * p) / gravity;
}

export function compileArgoProfile(
  station: ArgoStation,
  measurements: readonly (readonly unknown[])[],
): ArgoProfile | null {
  const samples = new Map<number, ArgoSample>();
  for (const [pressure, temperature, salinity] of measurements) {
    if (!valid(pressure, 0, 12_000) || !valid(temperature, -3, 50) || !valid(salinity, 0, 50)) continue;
    if (!samples.has(pressure))
      samples.set(pressure, {
        pressure,
        temperature,
        salinity,
        depth: depthFromPressure(pressure, station.lat),
      });
  }
  const ordered = [...samples.values()].sort((a, b) => b.pressure - a.pressure);
  if (ordered.length < 8 || ordered[0]!.pressure - ordered.at(-1)!.pressure < 100) return null;
  return { ...station, samples: ordered };
}

export function argoProfile(station: ArgoStation, input: unknown) {
  const offset = station.mode === "R" ? 0 : 6;
  const measurements: Measurement[] = [];
  for (const row of rows(input)) {
    const [pressure, temperature, salinity, ...quality] = row.slice(offset, offset + 6);
    if (typeof pressure !== "number" || typeof temperature !== "number" || typeof salinity !== "number")
      continue;
    if (quality.length === 3 && quality.every((flag) => flag === "1" || flag === "2"))
      measurements.push([pressure, temperature, salinity]);
  }
  return compileArgoProfile(station, measurements);
}
