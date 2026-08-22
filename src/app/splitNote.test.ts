import { describe, expect, it } from "vitest";
import { splitNote } from "./format";

describe("splitting a layer note for the key", () => {
  it("takes the first sentence, which is already the line the key wants", () => {
    const { head, rest } = splitNote(
      "the waves are floods running now, 9 of them across 9 countries. Nothing here rates them: "
      + "every flood in this feed is filed as magnitude zero.",
    );
    expect(head).toBe("the waves are floods running now, 9 of them across 9 countries.");
    expect(rest).toBe(
      "Nothing here rates them: every flood in this feed is filed as magnitude zero.",
    );
  });

  it("does not split inside a decimal or a percentage, which these sentences are full of", () => {
    expect(splitNote("9.4% of the surface. And the rest.").head).toBe("9.4% of the surface.");
    expect(splitNote("peaking at 20.5% chance, for this minute.").rest).toBeNull();
  });

  it("returns a null rest for a single sentence, so the row renders flat", () => {
    // A disclosure with nothing behind it is a control that lies about having more to say.
    expect(splitNote("the green is the aurora.")).toEqual({
      head: "the green is the aurora.", rest: null,
    });
    expect(splitNote("no full stop at all").rest).toBeNull();
  });

  it("keeps every word: head plus rest is the whole note", () => {
    const note = "the flames are forest fires burning now, 100 of them, 12,469 square kilometres "
      + "alight, burning 8 days at the median. The feed stops at 100, so the count is a floor.";
    const { head, rest } = splitNote(note);
    expect(`${head} ${rest}`).toBe(note);
  });
});
