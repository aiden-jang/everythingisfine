import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("the first Float Dive completes its cinematic rise without stretching playback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  await page.goto("/");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await page.getByRole("button", { name: "Browse stories", exact: true }).click();
  await page.locator("#open-story-float").click();
  const panel = page.getByRole("region", { name: "Float Dive", exact: true });
  await panel.getByRole("button", { name: "Follow the rise", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
  await expect(panel.getByRole("region", { name: "What this profile showed" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    panel.getByRole("heading", { name: "The warmest water was below the surface." }),
  ).toBeInViewport({ ratio: 1 });
  await expect(panel.locator(".float-observation")).toContainText("62 m · 6.90 °C");
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

for (const width of [1440, 390]) {
  test(`the first Float Dive connects its location, finding and kept return at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.route("https://erddap.marine.ie/**", (route) =>
      route.fulfill({ json: { table: { rows: [] } } }),
    );
    await page.goto("/");
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await page.getByRole("button", { name: "Browse stories", exact: true }).click();
    const entry = page.locator("#open-story-float");
    await entry.click();
    const panel = page.getByRole("region", { name: "Float Dive", exact: true });
    await expect(panel.getByRole("heading", { name: "Below the blue." })).toBeVisible();
    await expect(page.locator(".float-place")).toContainText("6901932");
    await expect(panel).toHaveAttribute("data-float-stage", "locate");
    await expect(page.locator(".float-scrub")).toHaveValue("0");
    await expect(page.locator(".float-playback-row")).toBeHidden();
    await panel.getByRole("button", { name: "Follow the rise", exact: true }).click();
    const transport = page.getByRole("group", { name: "Float Dive playback" });
    await expect(transport.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(transport.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
    await expect(panel).toHaveAttribute("data-float-stage", "rise");
    await transport.getByRole("slider", { name: "Ascent depth" }).press("End");
    await expect(panel.getByRole("region", { name: "What this profile showed" })).toBeVisible();
    await expect(panel.getByRole("img", { name: "Temperature through this water column" })).toBeVisible();
    await expect(panel.locator(".float-observation")).toContainText("62 m · 6.90 °C");
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBe(0);
    await panel.getByRole("button", { name: "Keep the 62 m reading", exact: true }).click();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("eif.visits-v2")!).saved[0]);
    expect(kept.position.float.index).toBe(536);
    expect(kept.observation.temperature).toBe(6.896);
    expect(kept.observation.salinity).toBe(34.928);
    await panel.getByRole("button", { name: "Return to your place", exact: true }).click();
    await expect(page.locator("#open-story-float")).toHaveCount(0);
    await expect(page.locator(".story-continue")).toBeFocused();
    await expect(page.locator(".story-continue")).toContainText("Kept here · 62 m · 6.90 °C");
    await page.locator(".story-continue").click();
    await expect(page.getByRole("slider", { name: "Ascent depth" })).toHaveValue("536");
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
