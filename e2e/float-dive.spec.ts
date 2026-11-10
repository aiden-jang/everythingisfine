import { expect, test } from "@playwright/test";
import { installFeeds, revealStoryTools } from "./feeds";

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
  await expect(dive.getByRole("button", { name: "Replay ascent" })).toBeVisible();
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
