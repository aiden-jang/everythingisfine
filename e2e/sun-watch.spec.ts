import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function installSun(page: Page, windAvailable = true, xrayAge = 1) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  const requests = { wind: 0, xray: 0 };
  await page.route("**/json/rtsw/rtsw_wind_1m.json", (route) => {
    requests.wind++;
    if (!windAvailable) return route.fulfill({ status: 503, body: "" });
    const time_tag = new Date(Date.now() - 2 * 60_000).toISOString().slice(0, -1);
    return route.fulfill({
      json: [
        { time_tag, active: true, source: "SOLAR1", proton_speed: 412, proton_density: 5.2 },
        { time_tag, active: false, source: "ACE", proton_speed: 550, proton_density: 3.8 },
      ],
    });
  });
  await page.route("**/json/goes/primary/xrays-6-hour.json", (route) => {
    requests.xray++;
    return route.fulfill({
      json: [
        {
          time_tag: new Date(Date.now() - xrayAge * 60_000).toISOString(),
          satellite: 18,
          energy: "0.1-0.8nm",
          flux: 1.23e-6,
        },
      ],
    });
  });
  return requests;
}

test("Sun Watch loads on demand and flies back to Earth inside After Dark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests = await installSun(page);
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect(page.getByRole("button", { name: "Follow the aurora" })).toBeEnabled();
  expect(requests).toEqual({ wind: 0, xray: 0 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Sun Watch", exact: true }).click();
  const stage = page.getByRole("region", { name: "Sun Watch readings" });
  await expect(page.getByRole("heading", { name: "Sun Watch", exact: true })).toBeVisible();
  await expect(stage.getByText("NASA SDO archive · 10 Sep 2025")).toBeVisible();
  await expect(stage.getByText("412", { exact: true })).toBeVisible();
  await expect(stage.getByText("1.23e-6", { exact: true })).toBeVisible();
  await expect(stage.getByText("Solar wind · schematic view")).toBeVisible();
  await expect(stage.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await expect(stage.getByText("Earth · After Dark")).toBeVisible();
  expect(requests).toEqual({ wind: 1, xray: 1 });
  await page.getByRole("button", { name: "Follow the aurora" }).click();
  await expect(stage).toBeHidden();
  await expect(page.getByRole("group", { name: "Globe readout" })).toContainText("30% model chance");
});

test("reduced motion keeps the measurements and aurora available during a solar-wind outage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installSun(page, false, 20);
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  const credit = page.getByRole("link", { name: "aiden jang", exact: true });
  await expect(credit).toBeInViewport({ ratio: 1 });
  const creditPosition = await credit.boundingBox();
  await page.getByRole("button", { name: "Sun Watch", exact: true }).click();
  const stage = page.getByRole("region", { name: "Sun Watch readings" });
  await expect(stage.getByText("Earth · After Dark")).toBeVisible();
  await expect(stage.getByText("NOAA feed unavailable")).toBeVisible();
  await expect(stage.getByText("Older reading")).toBeVisible();
  await expect(stage.getByText("1.23e-6", { exact: true })).toBeVisible();
  expect(await credit.boundingBox()).toEqual(creditPosition);
  await expect(stage.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await stage.getByRole("button", { name: "Sun", exact: true }).click();
  await expect(stage.getByText("NASA SDO archive · 10 Sep 2025")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.getByRole("button", { name: "Back to stars", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sun Watch", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Follow the aurora" })).toBeEnabled();
});
