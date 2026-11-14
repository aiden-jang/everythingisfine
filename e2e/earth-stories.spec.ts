import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

const stories = [
  ["fault", "Fault Offset", "Radar sweep"],
  ["dust", "Dust Curtain", "Open lidar slice"],
  ["fire", "Fire Front", "August"],
  ["ice", "Ice Line", "Minimum"],
  ["north", "Wandering North", "2025"],
  ["ozone", "Ozone Season", "October"],
  ["water", "Water Weight", "Drought"],
  ["comet", "Comet Return", "See from my city"],
] as const;

for (const [id, title, action] of stories) {
  test(`${title} shares the canvas, keeps its moment across projections`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 950 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /shader|WebGLProgram/.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(`/#v=observe&story=${id}`);
    const panel = page.getByRole("region", { name: title, exact: true });
    const timeline = panel.getByRole("slider");
    await expect(timeline).toBeVisible();
    await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await panel.getByRole("button", { name: action, exact: true }).click();
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
    const selected = await timeline.inputValue();
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(timeline).toHaveValue(selected);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: test.info().outputPath(`${id}-map.png`) });
    await panel.getByRole("button", { name: "Globe", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`${id}-globe.png`) });
    if (id === "fault") {
      await page.locator(".story-sites button:visible").first().click();
      await expect(panel.getByRole("combobox", { name: "Survey measurement" })).not.toHaveValue("");
      await expect(panel.getByText(/m .* horizontal offset · surveyed/)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
  test(`${title} copies an exact moment that reopens paused`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/#v=observe&story=${id}`);
    const panel = page.getByRole("region", { name: title, exact: true });
    const timeline = panel.getByRole("slider");
    await expect(timeline).toBeVisible();
    await panel.getByRole("button", { name: action, exact: true }).click();
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
    const selected = await timeline.inputValue();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            Object.assign(window, { copiedStory: value });
          },
        },
      });
    });
    if (id === "fault") {
      await panel.getByRole("button", { name: "Save view", exact: true }).click();
      await expect(panel.getByRole("status", { name: "Saved view status" })).toContainText(
        "Saved on this device",
      );
    }
    await panel.getByRole("button", { name: "Share this moment", exact: true }).click();
    await expect(panel.getByRole("status", { name: "Sharing status" })).toContainText("Link copied");
    const url = await page.evaluate(() => Reflect.get(window, "copiedStory") as string);
    const fragment = new URL(url).hash;
    expect(fragment).toContain(`story=${id}`);
    await page.goto("/" + fragment);
    await expect(timeline).toHaveValue(selected);
    await expect(panel.getByRole("button", { name: /^(Play|Replay)$/ })).toBeVisible();
  });
}

test("story search finds another scene and returns to the retained query on a narrow phone", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openStories(page);
  const search = page.getByRole("searchbox", { name: "Find a story" });
  await search.fill("NEOWISE");
  await page.locator("#search-story-comet").click();
  await expect(page.locator("#earth-story-time")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("phone-comet.png") });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(search).toHaveValue("NEOWISE");
  await expect(page.locator("#search-story-comet")).toBeFocused();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: test.info().outputPath("phone-story-search.png") });
});

test("an archived year switch keeps the calendar date and never starts playback", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/#v=observe&story=ozone&t=1158840000000&choice=2006");
  const panel = page.getByRole("region", { name: "Ozone Season", exact: true });
  await expect(panel.getByRole("slider")).toBeVisible();
  const at = await panel.locator(".story-time time").getAttribute("datetime");
  await panel.getByRole("combobox", { name: "Compare season" }).selectOption("2019");
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at!.replace("2006", "2019"));
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("story search starts an available aurora flight from the live scene", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openStories(page);
  await page.getByRole("searchbox", { name: "Find a story" }).fill("aurora");
  await page.locator("#search-story-aurora").click();
  await expect(page.getByRole("heading", { name: "Into the auroral oval." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay flight" })).toBeVisible();
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(page.locator("#search-story-aurora")).toBeFocused();
});

test("normal-motion entry can be interrupted and never replaces the shared canvas", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const original = await page.locator("#globe-view canvas").elementHandle();
  await openStories(page);
  await page.getByRole("button", { name: "Wandering North", exact: true }).click();
  const panel = page.getByRole("region", { name: "Wandering North", exact: true });
  await expect(panel.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "1970", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", "1970-01-01T12:00:00.000Z");
  await panel.getByRole("button", { name: "Back to stories", exact: true }).click();
  expect(await original!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
    true,
  );
});
