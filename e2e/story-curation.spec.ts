import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

for (const width of [1440, 390]) {
  test(`a first visit has one source-aware invitation and a curated catalogue at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.route(/ovation_aurora_latest\.json/, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const entry = page.locator("#start-story");
    await expect(entry).toContainText("Follow an ocean float");
    await expect(entry).toContainText("Recorded Argo profile");
    await page.screenshot({ path: test.info().outputPath(`first-minute-${width}.png`) });
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await entry.click();
    await expect(page.locator(".float-transport")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "About this shared view" })).toBeHidden();
    await page.getByRole("button", { name: "Back to home", exact: true }).click();
    await expect(entry).toBeHidden();
    await expect(page.locator("#continue-story")).toContainText("Float Dive");
    await expect(page.locator("#continue-story")).toBeFocused();
    await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
    await openStories(page, "search");
    await expect(page.locator(".story-choice > button")).toHaveText([
      "Storm Radar",
      "Tonight’s Sky",
      "Rupture Reveal",
    ]);
    await page.getByRole("button", { name: /^View all \d+ stories$/ }).click();
    await expect(page.locator(".story-choice > button").first()).toHaveText("Moonfall");
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`curated-stories-${width}.png`) });
  });
}

test("a shared story gives context, holds its moment, and ends with a finding @dev", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=aral&t=1325376000000&p=map");
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  await expect(panel.getByRole("complementary", { name: "About this shared view" })).toContainText(
    "Opened paused",
  );
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const slider = panel.getByRole("slider");
  const selected = await slider.inputValue();
  await expect(slider).toHaveValue(selected);
  await slider.focus();
  await slider.press("End");
  await expect(panel.getByRole("region", { name: "What this view showed" })).toContainText(
    "Missing observations are not dry land",
  );
  await expect(panel.getByText("Up next", { exact: true })).toBeVisible();
  await panel.getByRole("region", { name: "What this view showed" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("story-finding.png") });
});

test("native sharing has a story title and cancellation stays quiet @dev", async ({ page }) => {
  await installFeeds(page, { empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as unknown as { shared: ShareData }).shared = data;
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await page.goto("/#story=aral&t=1325376000000");
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  await expect(panel.getByRole("slider")).toBeVisible();
  await panel.getByRole("button", { name: "Share this moment", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared?: ShareData }).shared?.title))
    .toBe("Vanishing Sea · Everything is fine.");
  await expect(panel.getByRole("status", { name: "Sharing status" })).toBeEmpty();
  await expect(panel.getByRole("textbox", { name: "Story link" })).toBeHidden();
});
