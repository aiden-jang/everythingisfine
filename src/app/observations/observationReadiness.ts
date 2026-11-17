export function observationReadiness({
  hasFrame,
  loadingData,
  raster,
  image,
}: {
  hasFrame: boolean;
  loadingData: boolean;
  raster: boolean;
  image: "loading" | "failed" | "ready";
}): "preparing" | "ready" | "unavailable" {
  if (!hasFrame) return loadingData ? "preparing" : "unavailable";
  if (!raster) return "ready";
  return image === "loading" ? "preparing" : image === "failed" ? "unavailable" : "ready";
}
