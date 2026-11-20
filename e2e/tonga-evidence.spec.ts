import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 640],
  [320, 568],
  [812, 375],
]) {
  test(`Tonga connects its world and measured reading at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.goto("/share/tonga/PHNL/539/");
    const story = page.getByRole("region", { name: "Tonga’s shockwave", exact: true });
    await expect(story.getByRole("heading", { name: "A pulse recorded in Honolulu." })).toBeVisible();
    await expect(story.locator(".tonga-evidence-reading")).toContainText("1017.75");
    await expect(story.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await story.getByRole("button", { name: "Inspect reading", exact: true }).click();
    const sample = story.getByRole("slider", { name: "Station pressure time" });
    await expect(sample).toBeFocused();
    await expect(sample).toHaveValue("539");
    await sample.press("ArrowRight");
    await expect(sample).toHaveValue("540");
    await expect(sample).toHaveAttribute("aria-valuetext", "09:00 UTC · 1017.68 hPa");
    await expect(story.getByRole("slider", { name: "Replay time" })).toHaveCount(0);
    const plot = story.locator(".tonga-chart");
    const bounds = await plot.boundingBox();
    const body = await story.locator(".tonga-evidence-body").boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(body!.y);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(body!.y + body!.height);
    const field = story.locator(".tonga-chart-field");
    const fieldBox = await field.boundingBox();
    const timeBox = await story.locator(".tonga-evidence-time").boundingBox();
    const outline = await field.evaluate((node) => {
      const style = getComputedStyle(node);
      return parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    });
    expect(fieldBox!.y - outline).toBeGreaterThanOrEqual(timeBox!.y + timeBox!.height);
    await expect(story.locator(".tonga-evidence-reading")).toBeInViewport();
    const paper = await story.locator(".tonga-evidence").boundingBox();
    const credit = await page.locator(".creator-credit").boundingBox();
    if (width! < 900) expect(paper!.y + paper!.height).toBeLessThanOrEqual(credit!.y);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`tonga-inspect-${width}.png`) });
    const evidence = story.getByRole("region", { name: "Honolulu pressure evidence" });
    for (const name of ["Keep this reading", "Back to journey", "Share finding"]) {
      const button = evidence.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width!);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height! - 20);
    }
    await story.getByRole("button", { name: "Map", exact: true }).click();
    await expect(sample).toHaveValue("540");
    expect(
      await canvas!.evaluate((element) => element === document.querySelector("#globe-view canvas")),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await story.getByRole("button", { name: "Keep this reading", exact: true }).click();
    await expect(story.getByRole("region", { name: "Kept Tonga readings" })).toContainText("09:00 UTC");
    await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(story).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeVisible();
  });
}

test("two kept Tonga readings reopen independently without replacing the globe", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/share/tonga/PHNL/539/");
  const story = page.getByRole("region", { name: "Tonga’s shockwave", exact: true });
  await story.getByRole("button", { name: "Inspect reading", exact: true }).click();
  await story.getByRole("button", { name: "Keep this reading", exact: true }).click();
  await story.getByRole("button", { name: "Keep another reading", exact: true }).click();
  await story.getByRole("slider", { name: "Station pressure time" }).press("ArrowRight");
  await story.getByRole("button", { name: "Keep this reading", exact: true }).click();
  await expect(story.getByRole("region", { name: "Kept Tonga readings" })).toContainText("2 readings kept");
  await page.reload();
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const open = page.locator("#open-saved-observations");
  await open.click();
  const collection = page.getByRole("dialog", { name: "Saved observations", exact: true });
  const cards = collection.getByRole("article");
  await expect(cards).toHaveCount(2);
  await cards
    .filter({ hasText: "09:00 UTC" })
    .locator("..")
    .getByRole("button", { name: "Reopen this moment" })
    .click();
  await expect(story.getByRole("slider", { name: "Station pressure time" })).toHaveValue("540");
  await open.click();
  await cards
    .filter({ hasText: "08:59 UTC" })
    .locator("..")
    .getByRole("button", { name: "Reopen this moment" })
    .click();
  await expect(story.getByRole("slider", { name: "Station pressure time" })).toHaveValue("539");
  expect(await canvas!.evaluate((element) => element === document.querySelector("#globe-view canvas"))).toBe(
    true,
  );
});

test("a station link has source-specific metadata and opens its paused recipient view", async ({
  page,
  request,
}) => {
  const response = await request.get("/share/tonga/PHNL/539/");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("1017.75 hPa at 08:59 UTC");
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("Denied")) },
    });
  });
  await page.goto("/share/tonga/PHNL/539/");
  const story = page.getByRole("region", { name: "Tonga’s shockwave", exact: true });
  await story.getByRole("button", { name: "Inspect reading", exact: true }).click();
  await story.getByRole("button", { name: "Share finding", exact: true }).click();
  const link = story.getByRole("textbox", { name: "Story link", exact: true });
  await expect(link).toBeVisible();
  expect(new URL(await link.inputValue()).pathname).toBe("/share/tonga/PHNL/539/");
  await story.getByRole("button", { name: "Back to journey", exact: true }).click();
  await expect(story.getByRole("slider", { name: "Replay time", exact: true })).toHaveValue("539");
  await expect(story.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});
