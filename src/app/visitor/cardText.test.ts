import { expect, it } from "vitest";
import { cardText } from "./cardText";

it("wraps long source URLs and preserves every character", () => {
  const source = "https://github.com/aiden-jang/meanwhile/blob/main/src/geo/moon.ts";
  const lines = cardText(source, (text) => text.length, 20);
  expect(lines.every((line) => line.length <= 20)).toBe(true);
  expect(lines.join("")).toBe(source);
});

it("keeps words together when possible and handles empty labels", () => {
  expect(cardText("Station pressure at Honolulu", (text) => text.length, 16)).toEqual([
    "Station pressure",
    "at Honolulu",
  ]);
  expect(cardText("", (text) => text.length, 16)).toEqual([]);
});
