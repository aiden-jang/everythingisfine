import { expect, test } from "@playwright/test";
import { installFeeds, openLayer } from "./feeds";

test("phone story loading, retry and return work when feeds are unavailable", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", dead: true });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let recovered = false;
  await page.route(/\/aral-[\w-]+\.json$/, async (route) => {
    await held;
    if (recovered) await route.continue();
    else await route.fulfill({ status: 503, body: "" });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Feed status/ }).click();
  const feeds = page.getByRole("region", { name: "Background feed status" });
  await expect(feeds).toContainText("USGS");
  await expect(feeds).toContainText("Unavailable");
  await page.getByRole("button", { name: /Feed status/ }).click();

  await page.getByRole("button", { name: "Browse stories" }).click();
  const catalogue = page.getByRole("region", { name: "Story catalogue" });
  await expect(catalogue).toHaveCount(1);
  const query = catalogue.getByRole("searchbox", { name: "Find a story" });
  await query.fill("Aral");
  const result = catalogue.getByRole("button", { name: "Vanishing Sea", exact: true });
  await expect(result).toBeEnabled();
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  expect(canvas).not.toBeNull();
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  try {
    await result.click();
    await expect(
      panel.getByText("Preparing the observations. You can still explore the globe."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to stories" })).toBeVisible();
    await expect(page.locator("#globe-view canvas")).toBeVisible();
  } finally {
    release();
  }
  await expect(panel.getByText("The selected data could not load.")).toBeVisible();
  recovered = true;
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  const time = panel.getByRole("slider");
  await expect(time).toBeVisible();
  const initial = await time.inputValue();
  await time.press("End");
  await expect(time).not.toHaveValue(initial);

  await page.getByRole("button", { name: "Back to stories" }).click();
  await expect(query).toHaveValue("Aral");
  await expect(result).toBeFocused();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(errors).toEqual([]);
});

test("phone radar loads history on demand and stops the queue when a connection is interrupted", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", radar: "default", empty: true });
  const latest = Math.floor(Date.now() / 600_000) * 600_000;
  const times = Array.from({ length: 5 }, (_, index) => latest - (4 - index) * 600_000);
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
    "base64",
  );
  const requested = new Set<number>();
  let interrupted = true;
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) =>
    route.fulfill({
      json: {
        host: "https://tilecache.rainviewer.com",
        radar: { past: times.map((at, index) => ({ time: at / 1000, path: `/v2/radar/frame${index}` })) },
      },
    }),
  );
  await page.route("https://tilecache.rainviewer.com/**", (route) => {
    const frame = /\/frame(\d+)\//.exec(route.request().url());
    if (frame) {
      const index = Number(frame[1]);
      requested.add(index);
      if (interrupted && index === 0) return route.abort();
    }
    return route.fulfill({ contentType: "image/png", body: pixel });
  });

  await page.goto("/");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const credit = page.locator(".radar-canvas-credit time");
  await expect(credit).toHaveAttribute("datetime", new Date(latest).toISOString());
  await expect.poll(() => [...requested]).toEqual([4, 3]);
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await openLayer(page, "Storm radar");
  const scans = page.getByRole("group", { name: "Radar scan controls" });
  const slider = scans.getByRole("slider", { name: "Radar scan time" });
  const status = page.getByRole("region", { name: "Storm radar playback" });
  await slider.press("Home");
  await expect(status.getByRole("status", { name: "Radar status" })).toHaveText(
    "This scan’s image is unavailable.",
  );
  await slider.press("ArrowRight");
  await expect(status.getByRole("status", { name: "Radar status" })).toHaveText(
    "This scan’s image is unavailable.",
  );
  expect([...requested]).toEqual([4, 3, 0]);

  interrupted = false;
  await status.getByRole("button", { name: "Retry RainViewer" }).click();
  await expect(credit).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
  await expect.poll(() => requested.size).toBe(times.length);
  await page.locator("#view-projection").click();
  await expect(page.locator("#view-projection")).toHaveText("Globe");
  await expect(credit).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
