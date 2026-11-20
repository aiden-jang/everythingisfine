import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("a handoff keeps the map camera until the next observations are ready", async ({ page, isMobile }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/observations/reef**", async (route) => {
    await held;
    await route.fulfill({ status: 503, body: "Unavailable" });
  });
  const address = (field: string) => new URLSearchParams(new URL(page.url()).hash.slice(1)).get(field);
  await page.goto("/#v=observe&story=nino&p=map");
  const source = page.getByRole("region", { name: "El Niño Pulse", exact: true });
  await expect(source.getByRole("slider")).toBeVisible();
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await expect.poll(() => Number(address("at")?.split(",")[0])).toBeCloseTo(-160, 0);
  const start = address("at");
  if (!isMobile) {
    const bounds = await canvas!.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width * 0.73, bounds!.y + bounds!.height * 0.43);
    await page.mouse.wheel(0, -230);
    await expect.poll(() => address("at")).not.toBe(start);
  }
  const camera = address("at");
  const related = source.locator(".related-stories");
  await related.locator("summary").click();
  await related.getByRole("button", { name: /Reef Heat/ }).click();
  const incoming = page.getByRole("region", { name: "Reef Heat", exact: true });
  try {
    await expect(incoming.locator(".stage-readout")).toHaveText("Preparing the observations");
    await expect.poll(() => address("story")).toBe("reef");
    expect(address("at")).toBe(camera);
    await expect(incoming.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    release();
  }
  await expect(incoming.locator(".stage-readout")).toHaveText("Recent reef data unavailable");
  await incoming.getByRole("button", { name: "Open 2023 archive" }).click();
  await expect(incoming.getByRole("slider")).toBeVisible();
  await expect.poll(() => address("at")).not.toBe(camera);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
