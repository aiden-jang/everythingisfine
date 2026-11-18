import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test.use({ hasTouch: true });

test("expanded phone sheet keeps projection, legend and recorded radar sources reachable @dev", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { radar: "default" });
  const time = Math.floor(Date.now() / 600_000) * 600;
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) =>
    route.fulfill({
      json: {
        host: "https://tilecache.rainviewer.com",
        radar: { past: [{ time, path: "/v2/radar/check" }] },
      },
    }),
  );
  await page.route("https://tilecache.rainviewer.com/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.goto("/#v=explore&at=15,25,1.5");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const sheet = page.getByRole("separator", { name: "Sheet height", exact: true });
  const projection = page.locator("#view-projection");
  const sources = page.getByRole("button", { name: "Sources & times", exact: true });
  const credit = page.getByRole("link", { name: "Radar by RainViewer", exact: true });
  const legend = page.getByText("Legend", { exact: true });
  await expect(page.locator(".radar-canvas-credit time")).toHaveAttribute(
    "datetime",
    new Date(time * 1000).toISOString(),
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".key-hints")).toBeHidden();
    await sheet.press("Home");
    for (const control of [projection, sources, credit, legend]) {
      await expect(control).toBeInViewport({ ratio: 1 });
      await expect
        .poll(() =>
          control.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          }),
        )
        .toBe(true);
    }
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`world-controls-${viewport.width}.png`) });
    await projection.click();
    await expect(projection).toHaveText("Globe");
    await projection.click();
    await expect(projection).toHaveText("Map");
    await legend.click();
    await expect(page.getByRole("region", { name: "Legend", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Close legend", exact: true }).click();
    await sources.click();
    await expect(page.getByRole("group", { name: "Weather layer times", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close layer times", exact: true }).click();
  }
  await projection.focus();
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(page.locator("#chrome-head #view-projection")).toBeFocused();
  await expect(page.locator(".key-hints")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".canvas-information #view-projection")).toBeFocused();
  for (const viewport of [
    { width: 812, height: 375 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "View options", exact: true }).click();
    await expect(page.locator(".mobile-key-hints")).toBeHidden();
    await page.keyboard.press("Escape");
  }
});
