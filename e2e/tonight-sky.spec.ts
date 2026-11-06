import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("Tonight’s Sky follows the selected city and time on the same globe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-06T18:00:00Z"));
  await installFeeds(page, { presentation: "fresh" });
  await page.route("https://celestrak.org/NORAD/elements/gp.php?**", (route) => route.abort());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  const open = page.getByRole("button", { name: "Tonight’s Sky", exact: true });
  await open.click();
  const sky = page.getByRole("region", { name: "Tonight’s Sky" });
  const city = sky.getByRole("combobox", { name: "City" });
  await city.selectOption("Tokyo");
  const horizon = page.getByRole("group", { name: "Local horizon" });
  await expect(horizon).toContainText("Tokyo · Local horizon");
  await horizon.getByRole("button", { name: "Look east" }).click();
  await expect(horizon).toContainText("Facing E · 90°");
  const slider = sky.getByRole("slider", { name: "City local time" });
  const time = sky.locator("time");
  await slider.press("Home");
  const sunset = await time.getAttribute("datetime");
  const sunsetReadings = await sky.getByRole("list").innerText();
  await slider.press("End");
  const sunrise = await time.getAttribute("datetime");
  expect(Date.parse(sunrise!) - Date.parse(sunset!)).toBeGreaterThan(10 * 3_600_000);
  await expect(sky.getByRole("list")).not.toHaveText(sunsetReadings);
  await expect(horizon).toContainText("Facing E · 90°");
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(slider).toBeInViewport();
  await expect(page.getByRole("link", { name: "aiden jang", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(page.getByRole("button", { name: "Sun Watch", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("Tokyo");
  const meteorButton = page.getByRole("button", { name: "Meteor Nights", exact: true });
  await meteorButton.click();
  const meteor = page.getByRole("region", { name: "Meteor Nights" });
  await expect(meteor.getByRole("combobox", { name: "City" })).toHaveValue("Tokyo");
  await expect(horizon).toContainText("Facing E · 90°");
  await meteor.getByRole("combobox", { name: "Shower" }).selectOption("2026-12-13");
  await meteor.getByRole("button", { name: "Jump to a dark window" }).click();
  await expect(meteor.getByText(/Dark sky and Moon below the horizon/)).toBeVisible();
  await expect(horizon.locator("[data-radiant-arc]")).toHaveAttribute("d", /^M/);
  await meteor.getByRole("button", { name: "Sky view", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tonight’s Sky", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sky view", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(meteorButton).toBeFocused();
  await page.getByRole("button", { name: "Orbital Pass", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("Tokyo");
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  expect(errors).toEqual([]);
});
