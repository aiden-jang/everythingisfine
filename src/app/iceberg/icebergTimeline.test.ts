import { describe, expect, it } from "vitest";
import { dateIso, END, positionAt, tracks } from "./icebergTimeline";

describe("A-68A drift", () => {
  it("keeps the 13 descendant tracks and their published endpoints", () => {
    expect(tracks.map(({ id }) => id).join("")).toBe("ADEFGHIJKLMNOP");
    expect(dateIso(tracks[1]!.fixes[0]![0])).toBe("2020-12-17");
    expect(dateIso(END)).toBe("2021-04-16");
    const final = tracks.find(({ id }) => id === "J")!.fixes.at(-1)!;
    expect(dateIso(final[0])).toBe("2021-03-17");
  });

  it("does not connect or extrapolate across absent dates", () => {
    const track = {
      id: "D",
      fixes: [
        [3, -40, -55],
        [4, -38, -57],
        [7, -36, -54],
      ],
    } satisfies (typeof tracks)[number];
    expect(positionAt(track, 2)).toBeNull();
    expect(positionAt(track, 3.5)).toEqual([-39, -56]);
    expect(positionAt(track, 4.5)).toEqual([-38, -57]);
    expect(positionAt(track, 5)).toBeNull();
    expect(positionAt(track, 8)).toBeNull();
  });
});
