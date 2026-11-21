import { expect, test } from "@playwright/test";
import { installFeeds, openStories, saveImageButton, revealStoryTools, selectScene } from "./feeds";

test("Lights Return compares NASA recovery periods and returns to the same After Dark globe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The baseline also appears in discovery; fail an image loaded only by the replay.
  await page.route(/\/a\/maria-early-[^/]+\.webp$/, (route) => route.abort(), { times: 1 });
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await selectScene(page, "After Dark");
  await openStories(page);
  const open = page.getByRole("button", { name: "Lights Return", exact: true });
  await open.click();
  const panel = page.getByRole("region", { name: "Lights Return" });
  await expect(panel.getByRole("button", { name: "Back to stories" })).toBeFocused();
  await expect(panel.getByRole("status", { name: "Image loading status" })).toHaveText(
    "NASA’s archived images couldn’t load.",
  );
  await panel.getByRole("button", { name: "Retry images" }).click();
  const stage = panel.locator(".replay-stage");
  const periodTitle = panel.locator("[data-lights-period] h3");
  await expect(stage.locator(".stage-readout")).toContainText("Before Maria");
  await expect(await saveImageButton(page)).toBeEnabled();
  const period = panel.getByRole("slider", { name: "Night-light period" });
  const compare = panel.getByRole("button", { name: "Compare with before" });
  await expect(compare).toBeDisabled();
  await period.press("ArrowRight");
  await expect(periodTitle).toHaveText("Early aftermath");
  await expect(period).toHaveAttribute("aria-valuetext", /20 Sep – 20 Nov 2017/);
  await compare.click();
  const divider = panel.getByRole("slider", { name: "Before and after divider" });
  await expect(divider).toBeInViewport();
  await divider.press("End");
  await expect(stage.locator(".stage-readout")).toContainText("Before Maria");
  await divider.press("Home");
  await expect(stage.locator(".stage-readout")).toContainText("Early aftermath");
  await divider.press("ArrowRight");
  await expect(divider).toHaveValue("1");
  await expect(panel.locator(".lights-dates")).toContainText("Pre-storm baseline");
  const anchor = stage.getByText("Ponce", { exact: true });
  await expect(anchor).toBeVisible();
  const before = (await anchor.boundingBox())!;
  await divider.press("ArrowRight");
  const after = (await anchor.boundingBox())!;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2);
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(divider).toHaveValue("2");
  await period.press("End");
  await expect(periodTitle).toHaveText("Months 5–6");
  await expect(period).toHaveAttribute("aria-valuetext", /21 Jan – 20 Mar 2018/);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(period).toBeInViewport();
  await panel.getByRole("button", { name: "Replay" }).click();
  await expect(periodTitle).toHaveText("Before Maria");
  await expect(periodTitle).toHaveText("Early aftermath");
  await panel.getByRole("button", { name: "Pause" }).click();
  await expect(period).toHaveValue("1");
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await revealStoryTools(page);
  await expect(page.getByRole("button", { name: "Tonight’s Sky", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open.click();
  await expect(stage.getByText("Approaching the island", { exact: true })).toBeVisible();
  await expect(periodTitle).toHaveText("Early aftermath");
  await expect(period).toHaveValue("1");
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await period.press("End");
  await compare.click();
  await divider.press("End");
  await expect(stage.locator(".stage-readout")).toContainText("Before Maria");
  await panel.getByRole("button", { name: "Back to stories" }).click();
  await expect(open).toBeFocused();
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
  expect(errors).toEqual([]);
});
