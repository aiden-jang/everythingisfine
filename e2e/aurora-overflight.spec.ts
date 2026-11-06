import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

const follow = (page: Page) => page.getByRole("button", { name: "Follow the aurora" });

test("After Dark follows the NOAA forecast and returns to the stars", { tag: "@dev" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect(follow(page)).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await follow(page).click();
  const readout = page.getByRole("group", { name: "Globe readout" });
  await expect(readout).toContainText("30% model chance");
  await expect(readout).toContainText(/For \d\d:\d\d UTC/);
  const flight = () =>
    page.evaluate(() => {
      const globe = (
        window as unknown as {
          __globe: {
            auroraSweep: () => number;
            framingReady: () => boolean;
            state: () => { lat: number };
          };
        }
      ).__globe;
      return { sweep: globe.auroraSweep(), ready: globe.framingReady(), lat: globe.state().lat };
    });
  await expect.poll(async () => (await flight()).sweep).toBe(1);
  await expect.poll(async () => (await flight()).ready).toBe(true);
  expect(Math.abs((await flight()).lat)).toBeGreaterThanOrEqual(72);
  await page.getByRole("button", { name: "Back to stars" }).click();
  await expect(readout).toContainText("Catalogue sky");
  await expect(follow(page)).toBeFocused();
  await expect.poll(async () => (await flight()).sweep).toBe(0);
  expect(errors).toEqual([]);
});

test("the reduced-motion phone can read the current forecast and exit to Explore", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await follow(page).click();
  await expect(page.getByRole("heading", { name: "Into the auroral oval." })).toBeVisible();
  await expect(page.getByRole("link", { name: "NOAA OVATION forecast" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay flight" })).toBeFocused();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page.locator("#chrome-rail")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("eif.figures"))).toBeNull();
});

test("After Dark still opens when NOAA’s forecast is unavailable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route(/ovation_aurora_latest\.json/, (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The other side of day." })).toBeVisible();
  await expect(page.getByText("NOAA’s aurora forecast is unavailable.")).toBeVisible();
  await expect(follow(page)).toBeDisabled();
});
