import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("Home clears story browsing and browser Back restores it on the same globe @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await openStories(page);
  await page.getByRole("searchbox", { name: "Find a story or layer" }).fill("moon");
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stories & layers", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.goBack();
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("searchbox", { name: "Find a story or layer" })).toHaveValue("moon");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
});

test("rapid scene and presentation changes finish at the latest choice @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Below the Surface", exact: true })).toBeEnabled();
  const canvas = await page.locator("canvas").elementHandle();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const name of ["After Dark", "Below the Surface", "Live Earth", "After Dark"]) {
    await page.getByRole("button", { name, exact: true }).dispatchEvent("click");
  }
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Explore the globe", exact: true }).dispatchEvent("click");
  await page
    .getByRole("button", { name: "Everything Is Fine, back to the Observatory" })
    .dispatchEvent("click");
  await page.getByRole("button", { name: "Explore the globe", exact: true }).dispatchEvent("click");
  await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
  await expect
    .poll(() => page.locator(".zone-canvas").evaluate((node) => node.getAnimations().length))
    .toBe(0);
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
});
