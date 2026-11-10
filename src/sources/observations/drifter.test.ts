import { expect, it } from "vitest";
import { drifter } from "./drifter";

it("frames the selected recorded fix rather than leaving later readings at the departure point", async () => {
  for (const option of drifter.options!) {
    const data = await drifter.load(option.id, new AbortController().signal);
    expect(data.frames.length).toBeGreaterThan(1);
    for (const frame of data.frames) {
      const fix = frame.marks!.at(-1)!;
      expect(frame.camera).toMatchObject({ lon: fix.lon, lat: fix.lat });
    }
    expect(data.frames.at(-1)!.camera).not.toEqual(data.frames[0]!.camera);
  }
});
