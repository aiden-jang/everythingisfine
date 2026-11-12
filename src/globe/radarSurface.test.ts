import { Vector2, Vector3 } from "three";
import { expect, test } from "vitest";
import { toVec3 } from "../geo/sphere";
import { RADAR_BOUNDS } from "../sources/radar";
import { createRadarSurface } from "./radarSurface";
import { radarMercatorY } from "../sources/rainviewer";

test("the radar raster faces north and covers the bounds requested from NOAA", () => {
  const { object, setImage } = createRadarSurface({ value: 0 });
  const image = { width: 2, height: 2 } as ImageBitmap;
  setImage(image);
  const texture = object.material.map!;
  texture.updateMatrix();
  const { geometry } = object;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const [west, south, east, north] = RADAR_BOUNDS;
  const stride = geometry.parameters.widthSegments + 1;
  const corners = [
    { index: 0, lon: west, lat: north, pixel: [0, 0] },
    { index: stride - 1, lon: east, lat: north, pixel: [1, 0] },
    { index: position.count - stride, lon: west, lat: south, pixel: [0, 1] },
    { index: position.count - 1, lon: east, lat: south, pixel: [1, 1] },
  ];
  for (const { index, lon, lat, pixel } of corners) {
    const actual = new Vector3().fromBufferAttribute(position, index);
    const expected = new Vector3(...toVec3(lon, lat, geometry.parameters.radius));
    expect(actual.distanceTo(expected)).toBeCloseTo(0, 6);
    expect(texture.transformUv(new Vector2(uv.getX(index), uv.getY(index))).toArray()).toEqual(pixel);
  }
  const releases: unknown[] = [];
  texture.addEventListener("dispose", (event) => releases.push(event));
  setImage(image);
  expect(releases).toHaveLength(0);
  setImage(null);
  expect(releases).toHaveLength(1);
  expect(object.visible).toBe(false);
  geometry.dispose();
  object.material.dispose();
});

test("world radar preserves Mercator latitude, both date-line edges, and replaces geometry on source changes", () => {
  const { object, setImage } = createRadarSurface({ value: 1 });
  const original = object.geometry;
  let releases = 0;
  original.addEventListener("dispose", () => releases++);
  setImage({ width: 1024, height: 1024 } as ImageBitmap, true);
  expect(releases).toBe(1);
  const coordinates = object.geometry.getAttribute("aLonLat");
  const uv = object.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    expect(1 - uv.getY(i)).toBeCloseTo(radarMercatorY(coordinates.getY(i)), 5);
    expect(uv.getX(i)).toBeCloseTo((coordinates.getX(i) + 180) / 360, 5);
  }
  expect(coordinates.getX(0)).toBe(-180);
  expect(coordinates.getX(64)).toBe(180);
  setImage(null, false);
  expect(object.geometry.getAttribute("aLonLat").getX(0)).toBe(RADAR_BOUNDS[0]);
  object.geometry.dispose();
  object.material.dispose();
});
