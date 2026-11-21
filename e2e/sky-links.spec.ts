import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function configure(page: Page, now = "2026-11-06T18:00:00Z") {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Permission denied");
        },
      },
    });
  });
}

test("header Find searches all topics while the catalogue search respects the chosen topic", async ({
  page,
}) => {
  await configure(page);
  await page.goto("/#v=explore&scene=night&catalogue=night");
  const topics = page.getByRole("group", { name: "Story categories" });
  const field = page.getByRole("searchbox", { name: "Find a story" });
  await expect(topics.getByRole("button", { name: "After Dark" })).toHaveAttribute("aria-pressed", "true");
  await field.fill("Float Dive");
  await expect(page.getByText(/No matches in After Dark/)).toBeVisible();
  await page.getByRole("button", { name: "Find a story", exact: true }).click();
  await expect(field).toBeFocused();
  await expect(topics.getByRole("button", { name: "All topics" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#search-story-float")).toBeVisible();
  await field.fill("tonight's sky");
  await expect(page.locator("#search-story-sky")).toBeVisible();
  await field.fill("hurricanes");
  await expect(page.locator("#search-story-katrina")).toBeVisible();
  await field.fill("Gulf of Mexico");
  await expect(page.locator("#search-story-katrina")).toBeVisible();
  await topics.getByRole("button", { name: "Below the Surface" }).click();
  await field.fill("Float Dive");
  await expect(page.locator("#search-story-float")).toBeVisible();
});

test("sky links restore the city, night, selected body, bearing, and lunar stop in a fresh tab", async ({
  page,
  context,
}) => {
  await configure(page);
  await page.goto("/#v=observe&story=sky");
  const sky = page.getByRole("region", { name: "Tonight’s Sky", exact: true });
  await sky.getByRole("combobox", { name: "City", exact: true }).selectOption("Tokyo");
  const targets = sky.getByRole("list", { name: "Above the horizon" });
  const target = targets.getByRole("button").first();
  const body = (await target.getAttribute("aria-label"))!.replace(/^Find /, "");
  await target.click();
  const time = sky.getByRole("slider", { name: "City local time" });
  await expect(time).toBeVisible();
  await time.press("End");
  await time.press("ArrowLeft");
  const at = await sky.locator("time").getAttribute("datetime");
  const directions = sky.getByRole("button", { name: "Directions", exact: true });
  if (await directions.isVisible()) await directions.click();
  await sky.getByRole("button", { name: "Look south" }).click();
  await expect(page).toHaveTitle("Tonight’s Sky · meanwhile.");
  await sky.getByRole("button", { name: "Share this moment", exact: true }).click();
  const link = await sky.getByRole("textbox", { name: "Story link" }).inputValue();
  const shared = new URLSearchParams(new URL(link).hash.slice(1));
  expect(shared.get("body")).toBe(body);
  expect(shared.get("look")).toBe("180,16");
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("look")).toBe("180,16");

  const recipient = await context.newPage();
  await configure(recipient, "2027-01-13T12:00:00Z");
  await recipient.goto(link);
  const restored = recipient.getByRole("region", { name: "Tonight’s Sky", exact: true });
  await expect(restored.getByRole("combobox", { name: "City", exact: true })).toHaveValue("Tokyo");
  await expect(restored.locator("time")).toHaveAttribute("datetime", at!);
  await expect(restored.locator(".tonight-compass")).toContainText("Facing S · 180°");
  await expect(restored.locator(".tonight-labels [data-target]")).toHaveText(body);
  await restored
    .getByRole("group", { name: "Sky reference projection" })
    .getByRole("button", { name: "Map" })
    .click();
  await restored.getByRole("button", { name: "Share this moment", exact: true }).click();
  await recipient.goto(await restored.getByRole("textbox", { name: "Story link" }).inputValue());
  await expect(
    restored.getByRole("group", { name: "Sky reference projection" }).getByRole("button", { name: "Map" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(restored.locator("time")).toHaveAttribute("datetime", at!);

  await restored.locator("#open-moonfall").click();
  const lunar = recipient.getByRole("region", { name: "Moonfall", exact: true });
  const traverse = lunar.getByRole("combobox", { name: "Rover traverse" });
  const stop = lunar.getByRole("combobox", { name: "Geology stop" });
  await traverse.selectOption("1");
  await stop.selectOption("0");
  await lunar.getByRole("button", { name: "Landing map", exact: true }).click();
  const distance = lunar.getByRole("slider", { name: "Mapped distance" });
  const saved = await distance.inputValue();
  await lunar.getByRole("button", { name: "Share this moment", exact: true }).click();
  const lunarLink = await lunar.getByRole("textbox", { name: "Story link" }).inputValue();
  await page.goto(lunarLink);
  const reopened = page.getByRole("region", { name: "Moonfall", exact: true });
  await expect(page).toHaveTitle("Moonfall · meanwhile.");
  await expect(reopened.getByRole("combobox", { name: "Rover traverse" })).toHaveValue("1");
  await expect(reopened.getByRole("combobox", { name: "Geology stop" })).toHaveValue("0");
  await expect(reopened.getByRole("button", { name: "Landing map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(reopened.getByRole("slider", { name: "Mapped distance" })).toHaveValue(saved);
  await expect(reopened.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
});

test("Nightfall connects the landing globe to a shareable Apollo 17 stop and restores the view", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await configure(page, "2026-11-20T23:50:00Z");
  await page.goto("/#v=observe&at=-74,40,1");
  const trigger = page.getByRole("button", { name: "Follow nightfall", exact: true });
  await expect(trigger).toBeInViewport({ ratio: 1 });
  const globe = await page.locator("#globe-view canvas").elementHandle();
  await trigger.click();

  const sky = page.getByRole("region", { name: "Tonight’s Sky", exact: true });
  await expect(sky.getByRole("heading", { name: /^Nightfall in/ })).toBeVisible();
  const city = await sky.getByRole("combobox", { name: "City" }).inputValue();
  const at = await sky.locator(".tonight-invitation time").getAttribute("datetime");
  await expect(sky).toContainText("calculated local sunset");
  const moonEntry = sky.locator("#open-moonfall");
  await moonEntry.click();

  const lunar = page.getByRole("region", { name: "Moonfall", exact: true });
  await lunar.getByRole("combobox", { name: "Rover traverse" }).selectOption("1");
  await lunar.getByRole("combobox", { name: "Geology stop" }).selectOption("0");
  await lunar.getByRole("button", { name: "Landing map", exact: true }).click();
  await lunar.getByRole("button", { name: "Share this moment", exact: true }).click();
  const url = new URL(await lunar.getByRole("textbox", { name: "Story link" }).inputValue());
  expect(url.pathname).toBe("/share/moonfall/2/1/");
  const response = await request.get(url.pathname);
  expect(await response.text()).toContain('property="og:title" content="Nansen · Apollo 17"');
  expect((await request.get("/share/moonfall-2-1.jpg")).ok()).toBe(true);

  await lunar.getByRole("button", { name: "Back to Tonight’s Sky", exact: true }).click();
  await expect(sky.getByRole("combobox", { name: "City" })).toHaveValue(city);
  await expect(sky.locator(".tonight-invitation time")).toHaveAttribute("datetime", at!);
  await expect(moonEntry).toBeFocused();
  await sky.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("at")).toBe("-74,40,1");
  expect(await globe!.evaluate((element) => document.querySelector("#globe-view canvas") === element)).toBe(
    true,
  );

  await page.goto(url.pathname);
  await expect(lunar.getByRole("heading", { name: "Nansen", exact: true })).toBeVisible();
  await expect(lunar.getByRole("button", { name: "Landing map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(lunar.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
});

test("Moonfall keeps a tapped stop in place as the valley turns, including at phone sizes", async ({
  page,
}) => {
  await configure(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/share/moonfall/2/1/");
  const moon = page.getByRole("region", { name: "Moonfall", exact: true });
  const markers = moon.getByRole("group", { name: "Stops on the traverse" });
  const shorty = markers.getByRole("button", { name: "Inspect Shorty Crater", exact: true });
  await shorty.click();
  const stop = moon.getByRole("combobox", { name: "Geology stop" });
  const distance = moon.getByRole("slider", { name: "Mapped distance" });
  await expect(stop).toHaveValue("2");
  await expect(moon.getByRole("heading", { name: "Shorty Crater", exact: true })).toBeVisible();
  await expect(moon.getByText(/Schmitt spotted orange soil/)).toBeVisible();
  await expect(moon.getByRole("link", { name: "Read the mission journal" })).toHaveAttribute(
    "href",
    "https://apollojournals.org/alsj/a17/a17.sta4.html",
  );
  const savedDistance = await distance.inputValue();
  const before = (await shorty.boundingBox())!;
  const terrain = moon.getByRole("button", { name: "Terrain", exact: true });
  await terrain.press("Enter");
  await expect(markers).toHaveAttribute("data-turning", "true");
  await expect(markers).not.toHaveAttribute("data-turning", "true");
  const after = (await shorty.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  await expect(distance).toHaveValue(savedDistance);

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 320, height: 568 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    const map = moon.getByRole("button", { name: "Landing map", exact: true });
    await expect(map).toBeInViewport({ ratio: 1 });
    await expect(shorty).toBeInViewport({ ratio: 1 });
    const terrainPoint = (await shorty.boundingBox())!;
    await map.click();
    await expect(map).toHaveAttribute("aria-pressed", "true");
    await expect(markers).not.toHaveAttribute("data-turning", "true");
    const mapPoint = (await shorty.boundingBox())!;
    expect(mapPoint.x).toBeCloseTo(terrainPoint.x, 0);
    expect(mapPoint.y).toBeCloseTo(terrainPoint.y, 0);
    await expect(shorty).toHaveAttribute("aria-pressed", "true");
    await expect(distance).toHaveValue(savedDistance);
    await terrain.click();
    if (size.width === 812) {
      await shorty.click();
      await expect(distance).toHaveValue(savedDistance);
    }
  }
});
