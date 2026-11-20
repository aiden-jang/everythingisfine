import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

for (const width of [1440, 390]) {
  test(`the landing and curated catalogue each have one clear goal at ${width}px @dev`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.route(/ovation_aurora_latest\.json/, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const browse = page.getByRole("button", { name: "Browse stories", exact: true });
    await expect(browse).toBeVisible();
    await expect(page.getByRole("group", { name: "Earth scenes" })).toHaveCount(0);
    await expect(page.locator(".story-continue")).toHaveCount(0);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await expect(page.getByText("Loading the globe…", { exact: true })).toBeHidden();
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`first-minute-${width}.png`) });
    await browse.click();
    await expect(page.getByRole("tab", { name: "Stories", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("region", { name: "Story catalogue", exact: true })).toHaveCount(1);
    await expect(page.locator("#observatory-intro")).toHaveCount(0);
    await expect(page.locator("#open-featured-tonga")).toHaveAccessibleName("Open story: Tonga’s shockwave");
    const entry = page.locator("#open-story-float");
    await expect(entry).toHaveAccessibleName("Float Dive");
    await expect(entry).toHaveAccessibleDescription(/Measured profile/);
    await entry.click();
    await expect(page.locator(".float-transport")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "About this shared view" })).toBeHidden();
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(entry).toBeHidden();
    await expect(page.locator(".story-continue")).toContainText("Float Dive");
    await expect(page.locator(".story-continue")).toBeFocused();
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await openStories(page, "search");
    await expect(page.locator(".story-choice > button")).toHaveText([
      "Tonga’s shockwave",
      "Tonight’s Sky",
      "Rupture Reveal",
    ]);
    if (width === 390) await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole("button", { name: /^View all \d+ stories$/ }).click();
    await expect(page.locator(".story-choice > button").first()).toHaveText("Float Dive");
    await expect(page.getByRole("heading", { name: "All stories", exact: true, level: 3 })).toBeFocused();
    if (width === 390) {
      const rail = page.locator("#chrome-rail");
      await rail.evaluate((node) => node.scrollTo({ top: 600 }));
      await expect(page.getByRole("searchbox", { name: "Find a story" })).toBeInViewport({ ratio: 1 });
      await page.getByRole("button", { name: "Topics", exact: true }).click();
      await expect(page.getByRole("button", { name: "All topics", exact: true })).toBeFocused();
    }
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`curated-stories-${width}.png`) });
  });
}

test("a shared story gives context, holds its moment, and ends with a finding @dev", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=aral&t=1325376000000&p=map");
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  await expect(panel.getByRole("complementary", { name: "About this shared view" })).toContainText(
    "Opened paused at the 2011 annual water classification",
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
  const year = panel.getByRole("region", { name: "What this view showed" }).locator("time");
  await expect(year).toHaveText("2021");
  await expect(year).toHaveAttribute("datetime", "2021");
  await expect(panel.getByText("Up next", { exact: true })).toBeVisible();
  await panel.getByRole("region", { name: "What this view showed" }).scrollIntoViewIfNeeded();
  if (process.env["EIF_CAPTURE_UI"])
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
    .toBe("Vanishing Sea · meanwhile.");
  await expect(panel.getByRole("status", { name: "Sharing status" })).toBeEmpty();
  await expect(panel.getByRole("textbox", { name: "Story link" })).toBeHidden();
});
