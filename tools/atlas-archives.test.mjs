import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
const root = new URL("../src/sources/earth-atlas/", import.meta.url);
const archive = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8"));
test("scientific archives and rasters retain usable data and provenance", () => {
  for (const name of [
    "apophis",
    "eclipse",
    "bloom",
    "spring",
    "seafloor",
    "glacier",
    "nino",
    "reef",
    "aral",
    "river",
  ]) {
    const source = archive(`${name}-sources`);
    assert.ok(Object.keys(source.sha256).length, name);
    assert.ok(Object.values(source.sha256).every((v) => /^[a-f0-9]{64}$/.test(v)));
  }
  for (const file of readdirSync(new URL("assets/", root)).filter((f) => f.endsWith(".webp"))) {
    assert.ok(existsSync(new URL(`assets/${file}.json`, root)), file);
    assert.match(
      JSON.parse(readFileSync(new URL(`assets/${file}.json`, root), "utf8")).prompt,
      /Sourced scientific raster:/,
    );
  }
  assert.ok(archive("reef").frames.some((f) => f.keys !== null && f.sst !== null));
});
