import { expect, test } from "@playwright/test";
import { installFeeds, revealStoryTools, openStories } from "./feeds";

test("a pending recent Float Dive link survives reload and Back without becoming the bundled profile", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  const station = ["6901932", 269, "2026-10-30T12:24:00Z", 59.92957, -48.718805, "R", "A"];
  const profile = `recent/6901932/269/${Date.parse(station[2] as string)}`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = 0;
  await page.route("https://erddap.marine.ie/**", async (route) => {
    if (route.request().url().includes("distinct"))
      return route.fulfill({ json: { table: { rows: [station] } } });
    requested++;
    await held;
    if (route.request().failure()) return;
    await route.fulfill({
      json: {
        table: { rows: Array.from({ length: 11 }, (_, i) => [i * 100, 18 - i, 33 + i / 10, "1", "1", "1"]) },
      },
    });
  });
  const requestedProfile = () => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("choice");
  await page.goto(
    `/#${new URLSearchParams({ story: "float", choice: profile, chapter: "4", v: "observe" })}`,
  );
  await expect.poll(() => requested).toBe(1);
  expect(requestedProfile()).toBe(profile);
  await page.reload();
  await expect.poll(() => requested).toBe(2);
  expect(requestedProfile()).toBe(profile);
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await page.goBack();
  await expect.poll(() => requested).toBe(3);
  expect(requestedProfile()).toBe(profile);
  release();
  const dive = page.getByRole("region", { name: "Float Dive" });
  await expect(dive.getByText(/Recent profile · Cycle 269/)).toBeVisible();
  await expect(dive.getByText("12.00 °C", { exact: true })).toBeVisible();
  await expect(dive.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(requestedProfile()).toBe(profile);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("chapter")).toBe("4");
});

test("Float Dive scrubs Argo measurements on the same globe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-06T18:00:00Z"));
  await installFeeds(page, { presentation: "fresh" });
  let requests = 0;
  const profile = ["6901932", 269, "2026-10-30T12:24:00Z", 59.92957, -48.718805, "R", "A"];
  const unavailable = ["6901937", 269, "2026-11-01T06:00:00Z", 54.34, -32.65, "R", "B"];
  await page.route("https://erddap.marine.ie/**", (route) => {
    requests++;
    const url = route.request().url();
    const rows = url.includes("distinct")
      ? [profile, unavailable]
      : url.includes("6901932")
        ? Array.from({ length: 11 }, (_, i) => [i * 100, 18 - i, 33 + i / 10, "1", "1", "1"])
        : [];
    return route.fulfill({ json: { table: { rows } } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text());
  });

  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await revealStoryTools(page);
  const open = page.getByRole("button", { name: "Float Dive", exact: true });
  await expect(open).toBeEnabled();
  expect(requests).toBe(0);
  await open.click();
  const dive = page.getByRole("region", { name: "Float Dive" });
  await expect(dive.getByText(/Recorded profile · Cycle 268/)).toBeVisible();
  expect(
    await dive.locator("[data-float-depth]").evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(40);
  expect(
    await dive
      .locator(".float-value strong")
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  await expect(dive.locator(".float-value strong").first()).toBeInViewport({ ratio: 1 });
  const picker = dive.getByRole("combobox", { name: "Float profile" });
  await picker.selectOption({ label: "30 Oct 2026 · WMO 6901932" });
  await expect(dive.getByText(/Recent profile · Cycle 269/)).toBeVisible();
  const depth = dive.getByRole("slider", { name: "Ascent depth" });
  await expect(depth).toHaveAttribute("aria-valuetext", "988 m");
  await expect(dive.getByText("8.00 °C", { exact: true })).toBeVisible();
  await depth.press("End");
  await expect(depth).toHaveAttribute("aria-valuetext", "0 m");
  await expect(dive.getByText("18.00 °C", { exact: true })).toBeVisible();
  await expect(dive.getByText("33.000", { exact: true })).toBeVisible();
  await expect(dive.getByRole("button", { name: "Replay" })).toBeVisible();
  await picker.selectOption({ label: "1 Nov 2026 · WMO 6901937" });
  await expect(dive.getByText(/Still showing .* cycle/)).toBeVisible();
  await expect(depth).toHaveAttribute("aria-valuetext", "0 m");
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(depth).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(depth).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("link", { name: "aiden jang", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await page.goBack();
  await expect(depth).toHaveAttribute("aria-valuetext", "0 m");
  await expect(dive.getByText(/Recent profile · Cycle 269/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [1440, 390])
  test(`Float Dive explains measured scales and shares the selected sample paused at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    await page.route("https://erddap.marine.ie/**", (route) =>
      route.fulfill({ json: { table: { rows: [] } } }),
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("Unavailable")) },
      });
    });
    await page.goto("/");
    await openStories(page, "search");
    await page.getByRole("searchbox", { name: "Find a story" }).fill("Float Dive");
    await page.locator("#search-story-float").click();
    const dive = page.getByRole("region", { name: "Float Dive" });
    const depth = dive.getByRole("slider", { name: "Ascent depth" });
    await expect(depth).toBeVisible();
    await depth.press("End");
    const lastDepth = await depth.getAttribute("aria-valuetext");
    await expect(dive.getByRole("region", { name: "What this profile showed" })).toContainText("warmer than");
    await dive.getByText("View measured profile", { exact: true }).click();
    const profile = dive.getByRole("img", { name: /Temperature \(°C\) by estimated depth/ });
    await expect(profile).toBeVisible();
    await expect(profile).toContainText("Depth increases downward");
    await dive.getByRole("button", { name: "Salinity", exact: true }).click();
    await expect(dive.getByRole("img", { name: /Practical salinity by estimated depth/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (process.env["EIF_CAPTURE_UI"]) {
      await dive.locator(".float-profile").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/float-profile-${width}.png` });
      await dive.locator(".float-takeaway").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/float-ending-${width}.png` });
    }
    await dive.getByRole("button", { name: "Share this moment" }).click();
    const link = await dive.getByRole("textbox", { name: "Story link" }).inputValue();
    expect(new URLSearchParams(new URL(link).hash.slice(1)).get("story")).toBe("float");
    await page.goto(link);
    await expect(depth).toHaveAttribute("aria-valuetext", lastDepth!);
    await expect(dive.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
    await expect(dive.getByText(/Recorded profile · Cycle 268/)).toBeVisible();
  });
