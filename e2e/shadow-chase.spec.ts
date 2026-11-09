import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("Shadow Chase follows the globe and uses the saved city for local circumstances", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => localStorage.setItem("eif.sky-city", "New York"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Shadow Chase", exact: true });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  const panel = page.getByRole("region", { name: "Shadow Chase" });
  const stage = page.getByRole("group", { name: "Eclipse visualization" });
  await expect(panel.getByRole("button", { name: "Back to After Dark" })).toBeFocused();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();

  const shadow = panel.getByRole("slider", { name: "Shadow time" });
  await expect(shadow).toHaveAttribute("aria-valuetext", "08:26 UTC");
  await shadow.press("ArrowRight");
  await expect(shadow).toHaveAttribute("aria-valuetext", "08:28 UTC");
  await panel.getByRole("button", { name: "Greatest eclipse", exact: true }).click();
  await expect(stage.getByText("Greatest eclipse", { exact: true })).toBeVisible();
  await expect(panel.getByText("258 km")).toBeVisible();

  await panel.getByRole("button", { name: "From New York" }).click();
  await expect(panel.getByRole("heading", { name: "No visible eclipse in New York" })).toBeVisible();
  await expect(stage.getByText("Sun below the horizon", { exact: true })).toBeVisible();
  await expect(panel.getByRole("slider")).toHaveCount(0);

  await panel.getByRole("button", { name: "Preview totality in Luxor" }).click();
  await expect(panel.getByRole("heading", { name: "Total solar eclipse in Luxor" })).toBeVisible();
  await expect(panel.getByText("6m 20s")).toBeVisible();
  const sun = stage.locator(".shadow-disc");
  await expect(sun).toHaveAttribute("data-total", "true");
  const sky = panel.getByRole("slider", { name: "Local eclipse time" });
  await sky.press("Home");
  await expect(sun).not.toHaveAttribute("data-total", "true");
  await panel.getByRole("button", { name: "Peak eclipse" }).click();
  await expect(sun).toHaveAttribute("data-total", "true");
  expect(await page.evaluate(() => localStorage.getItem("eif.sky-city"))).toBe("New York");

  await panel.getByRole("button", { name: "Follow the shadow", exact: true }).click();
  await expect(shadow).toHaveAttribute("aria-valuetext", "10:06 UTC");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  expect(errors).toEqual([]);
});

test("normal motion starts the flight and reaches the saved city when animation frames stall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    localStorage.setItem("eif.sky-city", "London");
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((now) => {
        if (!document.documentElement.hasAttribute("data-stall-frames")) callback(now);
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Shadow Chase", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.evaluate((button) => {
    document.documentElement.setAttribute("data-stall-frames", "");
    button.click();
  });

  const panel = page.getByRole("region", { name: "Shadow Chase" });
  const shadow = panel.getByRole("slider", { name: "Shadow time" });
  await expect(shadow).not.toHaveAttribute("aria-valuetext", "08:26 UTC");
  await panel.getByRole("button", { name: "From London" }).evaluate((button) => button.click());
  const stage = page.getByRole("group", { name: "Eclipse visualization" });
  await expect(stage.locator(".shadow-disc")).toBeVisible();
  await expect(stage.getByText("Partial phase · 41.9% covered")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("eif.sky-city"))).toBe("London");

  await page.evaluate(() => document.documentElement.removeAttribute("data-stall-frames"));
  await panel.getByRole("button", { name: "Back to After Dark" }).click();
  await expect(trigger).toBeFocused();
});
