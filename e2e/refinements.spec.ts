import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

test("event links remain copyable when clipboard access is refused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now));
  await installFeeds(page, { now });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          if (!sessionStorage.getItem("allow-test-copy")) {
            throw new DOMException("Blocked", "NotAllowedError");
          }
          sessionStorage.setItem("copied-event-link", text);
        },
      },
    });
  });
  await page.goto("/");
  await waitForData(page);
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/[&#]e=usgs:/);
  await expect(page.getByRole("button", { name: "Copy citation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  const link = page.getByRole("textbox", { name: "Link to copy" });
  await expect(link).toBeVisible();
  await expect(link).toHaveValue(page.url());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await link.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`trim-sharing-${width}.png`),
      animations: "disabled",
    });
  }
  await page.evaluate(() => {
    sessionStorage.setItem("allow-test-copy", "1");
    const next = new URL(location.href);
    next.searchParams.set("sharing-check", "retry");
    history.replaceState(null, "", next);
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Link copied", exact: true })).toBeVisible();
  await expect(link).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("copied-event-link"))).toBe(page.url());
});

test("forced colors keep event selection and sharing usable", async ({ page }) => {
  await installFeeds(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForData(page);
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  const recent = page.getByRole("region", { name: "Recent earthquakes" });
  const selected = recent.locator('button[aria-current="true"]');
  const other = recent.locator("button:not([aria-current])").first();
  await expect(selected).toBeVisible();
  await expect(selected).toHaveCSS("border-bottom-width", "4px");
  expect(await selected.evaluate((el) => getComputedStyle(el).borderBottomWidth)).not.toBe(
    await other.evaluate((el) => getComputedStyle(el).borderBottomWidth),
  );
  await expect(selected).toHaveCSS("color", await other.evaluate((el) => getComputedStyle(el).color));
  await expect(selected.locator("span").first()).toHaveCSS(
    "color",
    await selected.evaluate((el) => getComputedStyle(el).color),
  );
  const activity = page.getByRole("group", { name: /^Activity by / });
  const bar = activity.locator("button > div[style]").first();
  await expect(bar).toHaveCSS(
    "background-color",
    await page.locator("body").evaluate((el) => getComputedStyle(el).color),
  );
  await expect(activity.getByRole("button").first()).toHaveCSS("border-left-width", "0px");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const copy = page.getByRole("button", { name: "Copy link", exact: true });
    await copy.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(copy).toBeFocused();
    await expect(copy).not.toHaveCSS("outline-style", "none");
    await expect(copy).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`details2-events-${width}-active.png`),
      animations: "disabled",
    });
  }
});
