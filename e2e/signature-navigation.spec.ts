import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

for (const width of [320, 390, 1440]) {
  test(`global discovery and saved observations retain the world and search at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh" });
    await page.goto("/");
    const original = await page.locator("#globe-view canvas").elementHandle();
    const browse = page.getByRole("button", { name: "Browse stories", exact: true });
    const wordmark = page.locator(".wordmark");
    await expect(browse).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    const markBox = await wordmark.boundingBox();
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`landing-${width}.png`) });
    await browse.click();
    await expect(page.getByRole("tab", { name: "Stories", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await wordmark.boundingBox()).toEqual(markBox);
    await wordmark.click();
    await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    expect(await wordmark.boundingBox()).toEqual(markBox);
    await page.getByRole("button", { name: "View options", exact: true }).click();
    const options = page.getByRole("region", { name: "View options", exact: true });
    await expect(options).toBeVisible();
    await expect(options).not.toContainText(/Find a story|Scene views|Privacy|Terms/);
    await page.keyboard.press("Escape");
    const legal = page.getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link", { name: "Privacy" })).toBeInViewport();
    await expect(legal.getByRole("link", { name: "Terms" })).toBeInViewport();
    await page.getByRole("button", { name: "Find a story", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Find a story", exact: true });
    await expect(search).toBeFocused();
    await search.fill("Tonga");
    await expect(page.getByRole("region", { name: "Search results" })).toContainText("Tonga");
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`search-${width}.png`) });
    const saved = page.getByRole("button", { name: "Saved observations and recent visits" });
    await saved.click();
    await expect(page.getByRole("region", { name: "Saved observations", exact: true })).toBeVisible();
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`saved-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(saved).toBeFocused();
    await expect(search).toHaveValue("Tonga");
    expect(await original!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    for (const control of await page.locator("#chrome-head > .observatory-header-actions > button").all()) {
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}
