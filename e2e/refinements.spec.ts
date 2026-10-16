import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

test("source citation recovery retains the exact provider text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now));
  await installFeeds(page, { now });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem("citation-attempt-url", location.href);
          if (!sessionStorage.getItem("allow-test-copy")) {
            throw new DOMException("Blocked", "NotAllowedError");
          }
          sessionStorage.setItem("copied-citation", text);
          sessionStorage.setItem("copied-citation-url", location.href);
        },
      },
    });
  });
  await page.goto("/");
  await waitForData(page);
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/[&#]e=usgs:/);
  await page.getByRole("button", { name: "Copy citation", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Citation to copy" });
  await expect(text).toBeVisible();
  await expect(text).toHaveValue(/Origin: .*Received: /s);
  await expect(text).toHaveValue(/Source: https:\/\//);
  const firstView = await page.evaluate(() => sessionStorage.getItem("citation-attempt-url"));
  expect(await text.inputValue()).toContain(`\n\nView: ${firstView}`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await text.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`refinement-citation-${width}.png`),
      animations: "disabled",
    });
  }
  const citation = await text.inputValue();
  await page.evaluate(() => {
    sessionStorage.setItem("allow-test-copy", "1");
    const next = new URL(location.href);
    next.searchParams.set("citation-check", "retry");
    history.replaceState(null, "", next);
  });
  await page.getByRole("button", { name: "Copy citation", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Citation copied");
  await expect(text).toHaveCount(0);
  const copied = await page.evaluate(() => ({
    text: sessionStorage.getItem("copied-citation"),
    url: sessionStorage.getItem("copied-citation-url"),
  }));
  expect(new URL(copied.url!).searchParams.get("citation-check")).toBe("retry");
  const providerText = citation.slice(0, citation.lastIndexOf("\n\nView: "));
  expect(copied.text).toBe(`${providerText}\n\nView: ${copied.url}`);
});

test("forced colors keep event selection and citation controls usable", async ({ page }) => {
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
    const copy = page.getByRole("button", { name: "Copy citation", exact: true });
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
