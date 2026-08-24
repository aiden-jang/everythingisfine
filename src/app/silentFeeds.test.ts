import { describe, expect, it } from "vitest";
import { silentFeeds } from "./format";

const all = { cyclones: true, volcanoes: true, fires: true, floods: true, aurora: true };

describe("naming the feeds that did not answer", () => {
  it("says nothing while everything answered", () => {
    // Reassurance is the one thing this app spends no words on.
    expect(silentFeeds(all)).toBeNull();
  });

  it("names one", () => {
    expect(silentFeeds({ ...all, aurora: false }))
      .toBe("No answer for the aurora: absent here does not mean absent.");
  });

  it("names several in the order the legend lists them", () => {
    expect(silentFeeds({ ...all, cyclones: false, floods: false }))
      .toBe("No answer for storms and floods: absent here does not mean absent.");
    expect(silentFeeds({ ...all, cyclones: false, fires: false, floods: false }))
      .toBe("No answer for storms, fires and floods: absent here does not mean absent.");
  });

  it("treats a total blackout as one fact about the network", () => {
    expect(silentFeeds({
      cyclones: false, volcanoes: false, fires: false, floods: false, aurora: false,
    })).toBe("No feed answered for any layer, so none are drawn.");
  });
});
