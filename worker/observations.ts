const HOUR = 3_600_000;
const GFS = "https://thredds.ucar.edu/thredds/ncss/grid/grib/NCEP/GFS/Global_0p25deg/Best";
type Source = "river" | "reef" | "reef-temperature" | "wind";
type Store = Pick<Cache, "match" | "put">;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Packet = { body: ArrayBuffer; init: { status: number; headers: Record<string, string> } };
const pending = new Map<string, Promise<Packet>>();

export function observationUrl(source: Source, now: number): string {
  if (source === "wind") {
    const start = (Math.floor(now / HOUR) - 3) * HOUR;
    const params = new URLSearchParams({
      north: "85",
      south: "-85",
      west: "-180",
      east: "179.75",
      horizStride: "24",
      vertCoord: "10",
      time_start: new Date(start).toISOString(),
      time_end: new Date(start + 27 * HOUR).toISOString(),
      accept: "netcdf",
    });
    params.append("var", "u-component_of_wind_height_above_ground");
    params.append("var", "v-component_of_wind_height_above_ground");
    return `${GFS}?${params}`;
  }
  if (source === "river") {
    const start = Math.floor((now - 6 * HOUR) / (6 * HOUR)) * 6 * HOUR;
    const params = new URLSearchParams({
      north: "60",
      south: "15",
      west: "-175",
      east: "-110",
      horizStride: "12",
      time_start: new Date(start).toISOString(),
      time_end: new Date(start + 24 * HOUR).toISOString(),
      timeStride: "2",
      accept: "netcdf",
    });
    for (const variable of [
      "Specific_humidity_isobaric",
      "u-component_of_wind_isobaric",
      "v-component_of_wind_isobaric",
      "Pressure_surface",
      "Precipitation_rate_surface",
    ])
      params.append("var", variable);
    return `${GFS}?${params}`;
  }
  if (source === "reef-temperature") {
    // OceanWatch accepts grid indices for this Florida Keys cell (24.425° N, 81.425° W).
    const query = "analysed_sst[last-55:1:last][2288][5571]";
    return `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/CRW_sst_v3_1.csv?${encodeURIComponent(query)}`;
  }
  const query = "degree_heating_week[last-49:7:last][(30):2:(18)][(-90):2:(-60)]";
  return `https://polarwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily.nc?${encodeURIComponent(query)}`;
}

async function provider(source: Source, fetcher: Fetcher, now: number): Promise<Response> {
  try {
    const response = await fetcher(observationUrl(source, now), {
      signal: AbortSignal.timeout(20000),
      // Workers supports manual redirects; reject non-success responses below.
      redirect: "manual",
    });
    if (!response.ok || !response.body) throw new Error("Provider unavailable");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4_000_000) {
          await reader.cancel();
          throw new Error("Oversized observation");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const prefix = new TextDecoder().decode(body.subarray(0, 32));
    if (
      !(source === "reef-temperature"
        ? prefix.startsWith("time,latitude,longitude,")
        : prefix.startsWith("CDF") && (body[3] === 1 || body[3] === 2))
    )
      throw new Error("Unexpected observation format");
    return new Response(body, {
      headers: {
        "Content-Type": source === "reef-temperature" ? "text/csv" : "application/x-netcdf",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("This observation provider is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "public, max-age=30", "Retry-After": "30" },
    });
  }
}

export async function relayObservation(
  request: Request,
  cache: Store,
  fetcher: Fetcher = fetch,
  now = Date.now(),
): Promise<Response> {
  const url = new URL(request.url),
    source = url.pathname.slice("/api/observations/".length);
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  if (url.search || !["river", "reef", "reef-temperature", "wind"].includes(source))
    return new Response("Unknown observation", { status: 404 });
  const key = `${url.origin}/api/observations/${source}?hour=${Math.floor(now / HOUR)}`;
  let work = pending.get(key);
  if (!work) {
    work = (async () => {
      const hit = await cache.match(key);
      const result = hit ?? (await provider(source as Source, fetcher, now));
      // Worker streams belong to their request; coalesced readers share only buffered data.
      const body = await result.arrayBuffer();
      const init = { status: result.status, headers: Object.fromEntries(result.headers) };
      if (!hit) await cache.put(key, new Response(body, init));
      return { body, init };
    })();
    pending.set(key, work);
  }
  try {
    const { body, init } = await work;
    return new Response(body, init);
  } finally {
    if (pending.get(key) === work) pending.delete(key);
  }
}
