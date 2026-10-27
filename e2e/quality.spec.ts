import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`controls and recovery fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: () => true });
      Object.defineProperty(navigator, "share", { value: () => Promise.reject(new Error("Unavailable")) });
    });
    await page.goto("/");
    await waitForData(page);
    await expect(page.locator("canvas")).toBeVisible();
    const capture = async (state: string): Promise<void> => {
      const layout = await page.evaluate(() => {
        const head = document.querySelector("#chrome-head")!.getBoundingClientRect();
        const rail = document.querySelector(".rail")!.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          head: head.bottom,
          rail: rail.width,
        };
      });
      expect(layout.overflow, state).toBeLessThanOrEqual(1);
      expect(layout.rail, state).toBeGreaterThan(200);
      expect(layout.head, state).toBeLessThan(150);
      if (process.env["EIF_CAPTURE_UI"]) {
        mkdirSync(process.env["EIF_CAPTURE_UI"], { recursive: true });
        await page.screenshot({
          path: join(process.env["EIF_CAPTURE_UI"], `${info.project.name}-${width}-${state}.png`),
        });
      }
    };
    await capture("live");
    if (width < 768) {
      await page.getByRole("button", { name: "more", exact: true }).click();
      await capture("utilities");
    }
    await page.getByRole("button", { name: "Still", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download image", exact: true })).toBeVisible();
    const notice = await page.locator(".still-notice").boundingBox();
    expect(notice!.x).toBeGreaterThanOrEqual(0);
    expect(notice!.x + notice!.width).toBeLessThanOrEqual(width);
    await capture("share-recovery");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(
      page.getByRole("button", { name: width < 768 ? "more" : "Still", exact: true }),
    ).toBeFocused();
    if (width < 768) await page.getByRole("button", { name: "Recent earthquakes", exact: true }).click();
    await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
    await capture("pinned");
  });
}

test("mobile utilities dismiss with Escape and return keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  const toggle = page.getByRole("button", { name: "more", exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const sound = page.getByRole("button", { name: "Sound off", exact: true });
  await expect(sound).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sound).toBeHidden();
  await expect(page.getByRole("button", { name: "more", exact: true })).toBeFocused();
});

test("mobile utilities dismiss outside and when focus leaves", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await page.getByRole("button", { name: "more", exact: true }).click();
  const sound = page.getByRole("button", { name: "Sound off", exact: true });
  await page.getByRole("button", { name: "View globe", exact: true }).click();
  await expect(sound).toBeHidden();
  await page.getByRole("button", { name: "more", exact: true }).click();
  await page.getByRole("button", { name: "Map", exact: true }).focus();
  await expect(sound).toBeHidden();
});

test("invalid saved preferences cannot break the globe or layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("eif.ramp", "unknown-palette");
    localStorage.setItem("eif.rail", "Infinity");
    localStorage.setItem("eif.regions", "Infinity");
  });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.locator(".rail").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(200);
  await expect(page.getByRole("button", { name: "Colourblind ramp off", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("eif.ramp"))).toBe("unknown-palette");
});

test("cancelling a resize releases page selection and stops movement", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  const handle = page.getByRole("separator", { name: "Rail width", exact: true });
  await handle.dispatchEvent("pointerdown", { pointerId: 1 });
  expect(await page.evaluate(() => document.body.style.userSelect)).toBe("none");
  const width = await handle.getAttribute("aria-valuenow");
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 500 }));
  });
  expect(await page.evaluate(() => document.body.style.userSelect)).toBe("");
  await expect(handle).toHaveAttribute("aria-valuenow", width!);
});

test("an empty saved dimension keeps the default spacing", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("eif.regions", " "));
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await expect(page.locator(".zones")).toHaveCSS("--regions-h", "132px");
});

test("failed native sharing keeps a downloadable still", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Refused", "NotAllowedError")),
    });
  });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Still", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sharing is unavailable" })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^everything-is-fine-.*\.png$/);
  await expect(page.getByText("Image downloaded.", { exact: true })).toBeVisible();
});

test("cancelling native sharing does not download or show an error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Dismissed", "AbortError")),
    });
  });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Still", exact: true }).click();
  await expect(page.getByRole("button", { name: "Still", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download image", exact: true })).toHaveCount(0);
  expect(downloads).toEqual([]);
});

test("a missing globe explains why a still cannot be captured", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await installFeeds(page);
  await page.goto("/");
  await expect(page.getByText("The globe could not start.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Still", exact: true }).click();
  await expect(
    page.getByText("The globe is not ready. Try again after it appears.", { exact: true }),
  ).toBeVisible();
});
