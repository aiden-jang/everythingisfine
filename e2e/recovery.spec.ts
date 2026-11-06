import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

test("WebGL failure leaves events usable and can recover", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
    (window as unknown as { restoreGraphics: () => void }).restoreGraphics = () => {
      HTMLCanvasElement.prototype.getContext = original;
    };
  });
  await installFeeds(page);
  await page.goto("/");
  await expect(page.getByText("The globe could not start.", { exact: true })).toBeVisible();
  await waitForData(page);
  const event = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first();
  await expect(event).toBeVisible();
  await event.click();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreGraphics: () => void }).restoreGraphics());
  await page.getByRole("button", { name: "Try the globe again", exact: true }).click();
  await expect(page.getByText("The globe could not start.", { exact: true })).toBeHidden();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("an archive response cannot undo returning to live", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await page.getByLabel("Go to a day", { exact: true }).fill("2011-03-11");
  await page.getByRole("button", { name: "go", exact: true }).click();
  await expect(page.getByText("2011-03-11, all day UTC.", { exact: false })).toBeVisible();
  await page.getByRole("slider", { name: "Time in the window", exact: true }).press("Home");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  let released = 0;
  let aborted = 0;
  const nextDay = (url: string) => new URL(url).searchParams.get("starttime")?.startsWith("2011-03-10");
  page.on("requestfailed", (request) => {
    if (nextDay(request.url())) aborted += 1;
  });
  await page.route(/fdsnws\/event\/1\/query/, async (route) => {
    if (!nextDay(route.request().url())) return route.fallback();
    arrived += 1;
    await barrier;
    released += 1;
    await route.fallback();
  });
  await page.getByRole("button", { name: "‹ 2011-03-10", exact: true }).click();
  // Hold both agency requests until returning to live cancels the whole archive load.
  try {
    await expect.poll(() => arrived).toBe(2);
    await page.getByRole("button", { name: "back to live", exact: true }).click();
    await expect.poll(() => aborted).toBe(2);
  } finally {
    release();
  }
  await expect.poll(() => released).toBe(2);
  await waitForData(page);
  await expect(page.getByRole("button", { name: "back to live", exact: true })).toBeHidden();
  await expect(page.getByLabel("Go to a day", { exact: true })).toHaveValue("");
  await expect(page.getByRole("slider", { name: "Time in the window", exact: true })).toHaveValue("1000");
  await expect(page.getByText("Nothing here is arriving now.", { exact: false })).toBeHidden();
});

test("the shared URL follows a held cursor and returning to live", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  const cursor = page.getByRole("slider", { name: "Time in the window", exact: true });
  await cursor.press("Home");
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).has("c")).toBe(true);
  await cursor.press("End");
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).has("c")).toBe(false);
});
