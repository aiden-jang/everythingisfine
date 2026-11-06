import { describe, expect, it } from "vitest";
import { radarCatalogUrl, radarImageUrl, radarScans } from "./radar";

const now = Date.UTC(2026, 10, 6, 1, 40);
const minutes = (count: number) => now - count * 60_000;
const row = (objectid: unknown, idp_validtime: number) => ({ attributes: { objectid, idp_validtime } });

describe("NOAA radar catalogue", () => {
  it("keeps one raster per published timestamp within the hour of the newest valid scan", () => {
    const result = radarScans(
      {
        features: [
          row(7, minutes(3)),
          row(3, minutes(63)),
          row(8, minutes(3)),
          row(1, minutes(64)),
          row(5, minutes(34)),
          row(2, minutes(-3)),
          row("bad", minutes(4)),
          {},
        ],
      },
      now,
    );
    expect(result).toEqual([
      { id: 3, at: minutes(63) },
      { id: 5, at: minutes(34) },
      { id: 8, at: minutes(3) },
    ]);
    expect(() => radarScans({ error: { code: 500 } }, now)).toThrow();
  });

  it("bounds the sequence and locks each image request to the selected CONUS record", () => {
    const features = Array.from({ length: 20 }, (_, index) => row(index + 1, minutes(20 - index)));
    expect(radarScans({ features }, now).map(({ id }) => id)).toEqual(
      features.slice(-13).map((row) => row.attributes.objectid),
    );
    expect(new URL(radarCatalogUrl()).searchParams.get("where")).toBe("category=1 AND idp_subset='CONUS'");
    const raster = new URL(radarImageUrl(17));
    expect(raster.pathname).toMatch(/exportImage$/);
    expect(JSON.parse(raster.searchParams.get("mosaicRule")!)).toEqual({
      mosaicMethod: "esriMosaicLockRaster",
      lockRasterIds: [17],
    });
  });
});
