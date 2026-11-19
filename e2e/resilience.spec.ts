import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("phone story loading, retry and return work when feeds are unavailable", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", dead: true });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let recovered = false;
  await page.route(/\/aral-[\w-]+\.json$/, async (route) => {
    await held;
    if (recovered) await route.continue();
    else await route.fulfill({ status: 503, body: "" });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Feed status/ }).click();
  const feeds = page.getByRole("region", { name: "Background feed status" });
  await expect(feeds).toContainText("USGS");
  await expect(feeds).toContainText("Unavailable");
  await page.getByRole("button", { name: /Feed status/ }).click();

  await page.getByRole("button", { name: "Browse stories" }).click();
  const catalogue = page.getByRole("region", { name: "Story catalogue" });
  await expect(catalogue).toHaveCount(1);
  const query = catalogue.getByRole("searchbox", { name: "Find a story" });
  await query.fill("Aral");
  const result = catalogue.getByRole("button", { name: "Vanishing Sea", exact: true });
  await expect(result).toBeEnabled();
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  expect(canvas).not.toBeNull();
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  try {
    await result.click();
    await expect(
      panel.getByText("Preparing the observations. You can still explore the globe."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to stories" })).toBeVisible();
    await expect(page.locator("#globe-view canvas")).toBeVisible();
  } finally {
    release();
  }
  await expect(panel.getByText("The selected data could not load.")).toBeVisible();
  recovered = true;
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  const time = panel.getByRole("slider");
  await expect(time).toBeVisible();
  const initial = await time.inputValue();
  await time.press("End");
  await expect(time).not.toHaveValue(initial);

  await page.getByRole("button", { name: "Back to stories" }).click();
  await expect(query).toHaveValue("Aral");
  await expect(result).toBeFocused();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(errors).toEqual([]);
});
