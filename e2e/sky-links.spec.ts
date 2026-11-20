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
