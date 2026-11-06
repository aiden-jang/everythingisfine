import { NetCDFReader, type Attribute } from "netcdfjs";
import type { GeoPoint, ObservationPath, ObservationSource } from "../../app/observations/types";
import { DEG } from "../../geo/sphere";
import { HOUR, request, utc } from "./common";
import jetStream from "./jet-stream.nc?url";

const GFS =
  "https://pae-paha.pacioos.hawaii.edu/thredds/ncss/grid/ncep_global/NCEP_Global_Atmospheric_Model_best.ncd";
const wrap = (lon: number) => ((lon + 540) % 360) - 180;

function vectors(u: number[], v: number[], lons: number[], lats: number[], offset: number) {
  const paths: ObservationPath[] = [];
  let maximum = 0;
  for (let row = 0; row < lats.length; row++) {
    const lat = lats[row]!;
    for (let column = 0; column < lons.length; column++) {
      const lon = wrap(lons[column]!);
      const index = offset + row * lons.length + column;
      const east = u[index]!;
      const north = v[index]!;
      const speed = Math.hypot(east, north);
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 150) continue;
      maximum = Math.max(maximum, speed);
      const scale = Math.min(0.32, 5 / speed);
      const points: GeoPoint[] = Array.from({ length: 4 }, (_, index) => ({
        lon: wrap(lon + (east * scale * index) / (3 * Math.max(0.24, Math.cos(lat * DEG)))),
        lat: Math.min(89, Math.max(-89, lat + (north * scale * index) / 3)),
        lift: 0.004,
      }));
      paths.push({ points, color: speed > 17 ? 0xedbc83 : speed > 9 ? 0x90ddd7 : 0x678ca9 });
    }
  }
  return { paths, maximum };
}

export const wind: ObservationSource = {
  options: [
    { id: "surface", label: "Surface · current forecast" },
    { id: "jet", label: "Jet stream · recorded forecast" },
  ],
  refreshMs: 3 * HOUR,
  async load(option, signal) {
    const jet = option === "jet";
    const from = Math.floor((Date.now() - 3 * HOUR) / HOUR) * HOUR;
    const params = new URLSearchParams({
      north: "85",
      south: "-85",
      west: "0",
      east: "359.5",
      horizStride: "12",
      time_start: utc(from),
      time_end: utc(from + 27 * HOUR),
      accept: "netcdf",
    });
    params.append("var", "ugrd10m");
    params.append("var", "vgrd10m");
    const response = await request(jet ? jetStream : `${GFS}?${params}`, signal);
    const grid = new NetCDFReader(await response.arrayBuffer());
    const variable = grid.variables.find(({ name }) => name === "time");
    const attributes: readonly Attribute[] = variable?.attributes ?? [];
    const unit = attributes.find(({ name }) => name === "units")?.value;
    const epoch = typeof unit === "string" ? /^hours? since (.+)$/i.exec(unit)?.[1] : undefined;
    const origin = Date.parse(epoch ?? "");
    const field = (name: string) => grid.getDataVariable(name).map(Number);
    const times = field("time");
    const runs = field(jet ? "reftime" : "time_run");
    const lons = field("longitude");
    const lats = field("latitude");
    const u = field(jet ? "u-component_of_wind_isobaric" : "ugrd10m");
    const v = field(jet ? "v-component_of_wind_isobaric" : "vgrd10m");
    if (!Number.isFinite(origin) || lons.length < 40 || lats.length < 20 || times.length === 0)
      throw new Error("Incomplete global wind grid");
    const frames = times
      .map((hour, index) => {
        const at = origin + hour * HOUR;
        const { paths, maximum } = vectors(u, v, lons, lats, index * lons.length * lats.length);
        return {
          at,
          paths,
          flow: true,
          measurements: [
            { label: "Wind level", value: jet ? "250 hPa · upper air" : "10 m above surface" },
            { label: "Fastest sampled wind", value: `${maximum.toFixed(1)} m/s` },
            {
              label: "Model run",
              value: Number.isFinite(runs[index])
                ? utc(origin + runs[index]! * HOUR)
                    .slice(0, 16)
                    .replace("T", " ") + " UTC"
                : "Unavailable",
            },
          ],
        };
      })
      .filter(({ paths }) => paths.length);
    return {
      target: { lon: -45, lat: 25, zoom: 0.91 },
      frames,
      note: `${jet ? "Recorded NOAA GFS upper-air forecast via NSF Unidata." : "Current NOAA GFS surface forecast via PacIOOS."} Strokes point downwind. Length and colour indicate speed on a sampled grid.`,
    };
  },
};
