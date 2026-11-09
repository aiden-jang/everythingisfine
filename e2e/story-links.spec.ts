import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

const restores = [
  {
    id: "katrina",
    title: "Eye of the Storm",
    at: "2005-08-28T18:00:00Z",
    slider: "Track time",
    value: "1080",
    map: true,
  },
  {
    id: "tonga",
    title: "Tonga’s shockwave",
    at: "2022-01-15T13:00:00Z",
    slider: "Replay time",
    value: "780",
    choice: "SFO",
  },
  {
    id: "megaflash",
    title: "Megaflash",
    at: "2017-10-22T08:56:49.834Z",
    slider: "Flash elapsed time",
    value: "16",
  },
  {
    id: "kilauea",
    title: "Kīlauea",
    slider: "Compare before and after",
    value: "0",
    chapter: "compare",
    choice: "0",
    map: true,
  },
  {
    id: "lights",
    title: "Lights Return",
    slider: "Before and after divider",
    value: "35",
    chapter: "compare:35",
    choice: "2",
  },
] as const;

for (const entry of restores) {
  test(`${entry.title} restores its archived selection and stays paused`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const params = new URLSearchParams({ story: entry.id, v: "observe" });
    if ("at" in entry) params.set("t", String(Date.parse(entry.at)));
    if ("chapter" in entry) params.set("chapter", entry.chapter);
    if ("choice" in entry) params.set("choice", entry.choice);
    if ("map" in entry) params.set("p", "map");
    await page.goto(`/#${params}`);
    const panel = page.getByRole("region", { name: entry.title, exact: true });
    const slider = panel.getByRole("slider", { name: entry.slider, exact: true });
    await expect(slider).toHaveValue(entry.value);
    await expect(panel.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
    if (entry.id === "tonga")
      await expect(panel.getByRole("combobox", { name: "Ground station" })).toHaveValue("SFO");
    if ("map" in entry)
      await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    await expect(slider).toHaveValue(entry.value);
  });
}

test("Shadow Chase restores the selected city’s eclipse view without saving the shared city", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const at = Date.parse("2027-08-02T09:10:00Z");
  await page.goto(`/#v=observe&story=shadow&t=${at}&city=London&chapter=saved`);
  const panel = page.getByRole("region", { name: "Shadow Chase", exact: true });
  await expect(panel.getByRole("button", { name: "From London", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.locator(".shadow-timeline time")).toHaveAttribute(
    "datetime",
    new Date(at).toISOString(),
  );
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("eif.sky-city"))).toBeNull();
});

test("Tōhoku links retain the two recorded-wave stations and cursor", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  const at = Date.parse("2011-03-11T06:06:24Z");
  await page.goto(`/#v=observe&story=rupture&t=${at}&chapter=waves&choice=1,3`);
  await expect(page.getByRole("combobox", { name: "First station" })).toHaveValue("1");
  await expect(page.getByRole("combobox", { name: "Second station" })).toHaveValue("3");
  await expect(page.getByRole("slider", { name: /Recording time/ })).toHaveValue("1200");
  await expect(page.getByRole("button", { name: "Play recording", exact: true })).toBeVisible();
});
