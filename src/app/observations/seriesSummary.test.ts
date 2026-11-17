import { describe, expect, it } from "vitest";
import { summarizeSeries } from "./seriesSummary";

describe("readable observation evidence", () => {
  it("retains actual uneven samples and reports chronological endpoints", () => {
    const result = summarizeSeries(
      {
        label: "Pressure",
        samples: [
          [30, 8],
          [0, 5],
          [11, 12],
        ],
      },
      10,
    );
    expect(result).toEqual({ first: [0, 5], last: [30, 8], selected: [11, 12], min: 5, max: 12, count: 3 });
  });
  it("does not describe invalid values as observations", () => {
    expect(
      summarizeSeries(
        {
          label: "Missing",
          samples: [
            [0, NaN],
            [Infinity, 4],
          ],
        },
        0,
      ),
    ).toBeNull();
    expect(summarizeSeries({ label: "Single", samples: [[2, 0]] }, 8)?.selected).toEqual([2, 0]);
  });
});
