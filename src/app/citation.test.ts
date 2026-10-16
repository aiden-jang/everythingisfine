import { expect, test } from "vitest";
import { quakeCitation, markCitation } from "./citation";
import type { Reading } from "../data/types";

const time = Date.parse("2026-10-15T12:00:00Z");
const reading: Reading = {
  id: "source-1",
  source: "usgs",
  magnitude: 4.2,
  scale: "ml",
  place: "Test coast",
  kind: "earthquake",
  time,
  receivedAt: time + 1000,
  lon: 10,
  lat: 20,
  depthKm: 5,
};
test("citations preserve each agency and distinguish origin from received time", () => {
  const text = quakeCitation(
    {
      key: "test",
      primary: reading,
      readings: [reading, { ...reading, source: "emsc", magnitude: 4.5, scale: "mb" }],
    },
    "https://example.test/#event",
  );
  expect(text).toContain("USGS · source-1");
  expect(text).toContain("EMSC · source-1");
  expect(text).toContain("M 4.2 ml");
  expect(text).toContain("M 4.5 mb");
  expect(text).toContain("Origin: 2026-10-15T12:00:00.000Z");
  expect(text).toContain("Received: 2026-10-15T12:00:01.000Z");
  expect(text).toContain("https://example.test/#event");
});
test("hazard citations label episode dates and omit unavailable dates", () => {
  const text = markCitation(
    {
      kind: "volcano",
      subject: {
        id: "volcano-1",
        name: "Test peak",
        country: "Italy",
        source: null,
        lon: 10,
        lat: 20,
        endedAt: time,
      },
    },
    { title: "Test peak", note: "Not erupting now.", lines: [] },
    "https://example.test/#mark",
  );
  expect(text).toContain("Provider: GDACS");
  expect(text).toContain("Episode ended: 2026-10-15T12:00:00.000Z");
  expect(text).toContain("Not erupting now.");
  expect(text).not.toContain("Origin:");
  expect(text).not.toContain("undefined");
});
