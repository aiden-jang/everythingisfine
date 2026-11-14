import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("a shared scene opens the same category in a fresh browser @dev", async ({ page, browser }) => {
  await installFeeds(page, { presentation: "fresh" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("catalogue"))
    .toBe("night");
  const recipient = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const other = await recipient.newPage();
    await installFeeds(other, { presentation: "fresh" });
    await other.goto(page.url());
    await expect(other.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(other.getByRole("button", { name: "Sun Watch", exact: true })).toBeVisible();
    await other.getByRole("button", { name: "After Dark", exact: true }).click();
    await expect
      .poll(() => new URLSearchParams(new URL(other.url()).hash.slice(1)).has("catalogue"))
      .toBe(false);
    await other.reload();
    await expect(other.getByRole("region", { name: "Stories and layers", exact: true })).toHaveCount(0);
    await expect(
      other.getByRole("group", { name: "Earth scenes" }).locator('[aria-pressed="true"]'),
    ).toHaveCount(0);
  } finally {
    await recipient.close();
  }
});

test("Home restores all scenes and browser Back restores it on the same globe @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await openStories(page);
  await page.getByRole("searchbox", { name: "Find a story" }).fill("moon");
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Stories and layers", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Earth scenes" }).locator('[aria-pressed="true"]'),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("searchbox", { name: "Find a story" })).toHaveValue("moon");
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

for (const width of [1440, 390]) {
  test(`scene categories return to All stories and Home restores the compact landing at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh" });
    await page.goto("/");
    const scenes = page.getByRole("group", { name: "Earth scenes", exact: true });
    const stories = page.getByRole("region", { name: "Stories and layers", exact: true });
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await expect(page.getByRole("button", { name: "Stories & layers", exact: true })).toHaveCount(0);
    await expect(stories).toHaveCount(0);
    await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
    for (const name of ["Live Earth", "Below the Surface", "After Dark"]) {
      const category = scenes.getByRole("button", { name, exact: true });
      await category.click();
      await expect(category).toHaveAttribute("aria-pressed", "true");
      await expect(stories).toBeVisible();
      await expect(stories.getByRole("searchbox")).toBeInViewport();
      await category.click();
      await expect(category).toHaveAttribute("aria-pressed", "false");
      await expect(stories.getByRole("heading", { name: "All stories", exact: true })).toBeVisible();
      await expect(category).toBeFocused();
      await page
        .getByRole("button", { name: "Everything Is Fine, back to the Observatory", exact: true })
        .click();
      await expect(stories).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeInViewport();
    }
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: test.info().outputPath(`compact-landing-${width}.png`) });
    await page.goBack();
    await expect(scenes.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(stories).toBeVisible();
    await expect(stories.getByRole("heading", { name: "All stories", exact: true })).toBeVisible();
  });
}
