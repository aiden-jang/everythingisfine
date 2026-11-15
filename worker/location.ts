function coordinate(value: unknown, limit: number): number | null {
  if (typeof value === "string") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) return null;
  return Math.round(value * 10) / 10;
}

export function approximateLocation(request: Request): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  let status = 200;
  let location: { lon: number; lat: number } | null = null;
  if (request.method !== "GET") {
    status = 405;
    headers["Allow"] = "GET";
  } else if (new URL(request.url).search) status = 400;
  else {
    const cf = (request as Request & { cf?: { longitude?: unknown; latitude?: unknown } }).cf;
    const lon = coordinate(cf?.longitude, 180);
    const lat = coordinate(cf?.latitude, 90);
    if (lon !== null && lat !== null) location = { lon, lat };
  }
  return new Response(JSON.stringify({ location }), { status, headers });
}
