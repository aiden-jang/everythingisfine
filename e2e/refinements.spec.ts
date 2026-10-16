import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

test("source citation recovery retains the exact provider text", async ({ page }) => {
  await installFeeds(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          if (!sessionStorage.getItem("allow-test-copy")) {
            throw new DOMException("Blocked", "NotAllowedError");
          }
          sessionStorage.setItem("copied-citation", text);
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
  expect(await text.inputValue()).toContain(`\n\nView: ${page.url()}`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await text.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`refinement-citation-${width}.png`),
      animations: "disabled",
    });
  }
  const citation = await text.inputValue();
  await page.evaluate(() => sessionStorage.setItem("allow-test-copy", "1"));
  await page.getByRole("button", { name: "Copy citation", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Citation copied");
  await expect(text).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("copied-citation"))).toBe(citation);
});
