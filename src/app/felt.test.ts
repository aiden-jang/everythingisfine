import { describe, expect, it } from "vitest";
import { feltNote } from "./DetailPanel";

describe("what the felt row says", () => {
  it("counts people, and one person is not one people", () => {
    expect(feltNote({ reports: 1 })).toBe("1 person");
    expect(feltNote({ reports: 2 })).toBe("2 people");
    expect(feltNote({ reports: 12_400 })).toBe("12,400 people");
  });

  it("names the shaking in words, at the step the number deserves", () => {
    /*
     * A community-determined intensity is a mean of what people ticked on a form, so a tenth of a step
     * is not a thing it knows. Rounded to the whole step and named, because "3.9" means nothing to a
     * reader and "light" is exactly what the scale calls it. The words are USGS's, including the two
     * steps that share one: intensity II and III are both "weak" there.
     */
    expect(feltNote({ reports: 77, intensity: 3.9 })).toBe("77 people, light");
    expect(feltNote({ reports: 5, intensity: 2.1 })).toBe("5 people, weak");
    expect(feltNote({ reports: 900, intensity: 6.4 })).toBe("900 people, strong");
  });

  it("says nothing at all when there is nothing to say", () => {
    // Absent, not zero: this app cannot tell "nobody felt it" from "nobody wrote in".
    expect(feltNote(undefined)).toBeNull();
    expect(feltNote({ reports: 0 })).toBeNull();
  });

  it("still counts when the intensity is missing, since the count is the fact", () => {
    expect(feltNote({ reports: 40 })).toBe("40 people");
  });

  it("cannot fall off either end of the scale", () => {
    expect(feltNote({ reports: 3, intensity: 0.2 })).toBe("3 people, not felt");
    expect(feltNote({ reports: 3, intensity: 99 })).toBe("3 people, extreme");
  });
});
