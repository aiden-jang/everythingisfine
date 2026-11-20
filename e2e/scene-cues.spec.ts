import { expect, test } from "@playwright/test";
import { installFeeds, openLayer, openStories, waitForData } from "./feeds";

test("the day–night cue follows the world and clears when opening layers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-20T13:50:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/#v=observe&at=-74,40,1");
  const canvas = page.locator("#globe-view canvas");
  const cue = page.locator("[data-dayline-label]");
  await expect(cue).toHaveAttribute("data-visible", "");
  const initial = await cue.evaluate((element) => element.style.transform);
  await page.locator("#globe-view").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => cue.evaluate((element) => element.style.transform)).not.toBe(initial);
  if (process.env["EIF_CAPTURE_UI"]) await page.screenshot({ path: test.info().outputPath("boundary.jpg") });
  const world = await canvas.elementHandle();
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/ }).click();
  await expect(cue).toHaveCount(0);
  expect(await world!.evaluate((element) => document.querySelector("#globe-view canvas") === element)).toBe(
    true,
  );
});

test("a layer example points to a drawn report without reframing either projection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "explore" });
  await page.goto("/#v=explore&at=132,14,1");
  await waitForData(page);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const pose = () => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("at");
  const example = page.locator("[data-layer-example]");
  await expect.poll(() => Number(pose()?.split(",")[0])).toBeCloseTo(132, 0);
  const before = pose();
  await openLayer(page, "Tropical cyclones");
  await expect(example).toHaveAttribute("data-picked", "");
  expect(pose()).toBe(before);
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: test.info().outputPath("layer-globe.jpg") });
  await page.getByRole("button", { name: "Back to layers", exact: true }).click();
  await expect(example).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Map", exact: true })).toBeVisible();
  const mapPose = pose();
  await openLayer(page, "Earthquakes");
  await expect(example).toHaveAttribute("data-picked", "");
  expect(pose()).toBe(mapPose);
  if (process.env["EIF_CAPTURE_UI"]) await page.screenshot({ path: test.info().outputPath("layer-map.jpg") });
  expect(await canvas!.evaluate((element) => document.querySelector("#globe-view canvas") === element)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Earthquakes", exact: true }).click();
  await expect(example).toHaveCount(0);
});

test("featured artwork keeps the story’s subject at both crop ratios", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page, "search");
  const art = page.locator(".featured-story-art img");
  await expect(art).toHaveAttribute("data-art-ready", "");
  await expect(art).toHaveCSS("object-position", "49% 52%");
  await page.getByRole("button", { name: "Earth", exact: true }).click();
  await expect(art).toHaveAttribute("data-story", "float");
  await expect(art).toHaveAttribute("data-art-ready", "");
  await expect(art).toHaveCSS("object-position", "78% 30%");
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: test.info().outputPath("artwork-phone.jpg") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(art).toHaveCSS("object-position", "78% 30%");
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: test.info().outputPath("artwork-desktop.jpg") });
});
