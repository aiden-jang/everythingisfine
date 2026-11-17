import { expect, it } from "vitest";
import { pressureMoment, pressureShare } from "./pressureShare";

it("shares an exact archived minute without query data", () => {
  const moment = pressureMoment("/share/tonga/PHNL/539/")!;
  delete moment.chapter;
  const share = pressureShare(
    { ...moment, at: moment.at! + 30_000, map: true },
    "https://example.com/?private=yes",
  );
  const url = new URL(share.url);
  expect(url.pathname).toBe("/share/tonga/PHNL/539/");
  expect(url.search).toBe("");
  expect(url.hash).toContain("chapter=pressure");
  expect(url.hash).toContain("p=map");
  expect(new URLSearchParams(url.hash.slice(1)).get("t")).toBe(String(moment.at));
  expect(share.text).toContain("1017.75 hPa at 08:59 UTC");
});
it("rejects routes outside the bundled station samples", () => {
  for (const path of [
    "/share/tonga/PHNL/494/",
    "/share/tonga/PHNL/595/",
    "/share/tonga/FAKE/539/",
    "/share/tonga/PHNL/539.1/",
    "/share/tonga/PHNL/539/extra",
  ])
    expect(pressureMoment(path)).toBeUndefined();
  expect(pressureMoment("/share/tonga/SFO/723/")?.choice).toBe("SFO");
});
