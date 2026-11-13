import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

async function tides(page: Page) {
  await page.route("https://api.tidesandcurrents.noaa.gov/**", (route) => {
    const key = route.request().url().includes("product=predictions") ? "predictions" : "data";
    return route.fulfill({
      json: {
        [key]: Array.from({ length: 7 }, (_, i) => ({
          t: `2026-11-09 12:${String(i * 6).padStart(2, "0")}`,
          v: String(0.2 + i / 10),
        })),
      },
    });
  });
}

for (const [id, titles] of [
  ["above-earth", ["Tonight’s Sky", "Moonfall", "Orbital Pass"]],
  ["water-in-motion", ["Atmospheric River", "Rainbelt", "River Pulse"]],
  ["reading-the-coast", ["Kīlauea", "Tsunami Arrival", "Tide Watch"]],
] as const) {
  test(`${id} keeps one canvas across its guided views and finishes in free exploration`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await tides(page);
    await page.route("**/api/observations/river", (route) => route.abort());
    await page.goto("/");
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await openStories(page, "all");
    await page.locator(`#journey-${id}`).click();
    const journey = page.getByRole("region", { name: "Current journey", exact: true });
    await expect(journey).toContainText("1 of 3");
    await expect(page.getByRole("heading", { name: titles[0], exact: true })).toBeVisible();
    const skyTime = page.getByRole("slider", { name: "City local time", exact: true });
    if (id === "above-earth") await skyTime.press("End");
    const savedTime = id === "above-earth" ? await skyTime.inputValue() : null;
    await journey.getByRole("button", { name: `Next: ${titles[1]}`, exact: true }).click();
    await expect(journey).toContainText("2 of 3");
    await expect(page.getByRole("heading", { name: titles[1], exact: true })).toBeVisible();
    await journey.getByRole("button", { name: "Previous view", exact: true }).click();
    await expect(journey).toContainText("1 of 3");
    if (savedTime !== null) await expect(skyTime).toHaveValue(savedTime);
    await journey.getByRole("button", { name: `Next: ${titles[1]}`, exact: true }).click();
    await journey.getByRole("button", { name: `Next: ${titles[2]}`, exact: true }).click();
    await expect(journey).toContainText("3 of 3");
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    await journey.getByRole("button", { name: "Finish journey", exact: true }).click();
    await expect(journey).toHaveCount(0);
    await expect(page.locator(".related-stories summary")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("related stories cross scenes and return to an available catalogue control", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=katrina");
  await page.getByText("Keep exploring", { exact: true }).click();
  await page.getByRole("button", { name: /^Lights Return/ }).click();
  await expect(page.getByRole("heading", { name: "Lights Return", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Back to After Dark/ }).click();
  await expect(page.getByRole("group", { name: "Earth scenes", exact: true })).toBeFocused();
});

for (const view of ["Meteor Nights", "Moonfall"] as const) {
  test(`Tonight’s Sky opens again after its internal ${view} view`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.goto("/");
    await openStories(page);
    await page.getByRole("searchbox", { name: "Find a story" }).fill("Tonight’s Sky");
    await page.locator("#search-story-sky").click();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const city = page.getByRole("combobox", { name: "City", exact: true });
    await city.selectOption({ label: "Seoul" });
    const time = page.getByRole("slider", { name: "City local time", exact: true });
    await time.press("End");
    const savedTime = await time.inputValue();
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.getByText("Keep exploring", { exact: true }).click();
    await page.locator(".related-stories button").click();
    await expect(page.getByRole("heading", { name: "Tonight’s Sky", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sky view", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(city).toHaveValue("Seoul");
    await expect(time).toHaveValue(savedTime);
    await expect(page.getByRole("button", { name: "Back to After Dark", exact: true })).toBeFocused();
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
  });
}

test("measurement sound requires a gesture, follows readings and closes when the view leaves", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { created: 0, closed: 0, pitches: [] as number[] };
    Object.assign(window, { measurementAudio: state });
    class Context {
      state = "running";
      destination = {};
      get currentTime() {
        return performance.now() / 1000;
      }
      constructor() {
        state.created++;
      }
      async resume() {}
      async close() {
        state.closed++;
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          disconnect() {},
        };
      }
      createOscillator() {
        const node = {
          type: "",
          frequency: { value: 0 },
          onended: null,
          connect(gain: unknown) {
            return gain;
          },
          disconnect() {},
          start() {
            state.pitches.push(node.frequency.value);
          },
          stop() {},
        };
        return node;
      }
    }
    Object.assign(window, { AudioContext: Context });
  });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await tides(page);
  await page.goto("/#v=observe&story=tide");
  const listen = page.getByRole("button", { name: "Listen to water level", exact: true });
  await expect(listen).toBeVisible();
  const audio = () =>
    page.evaluate(
      () =>
        (window as unknown as { measurementAudio: { created: number; closed: number; pitches: number[] } })
          .measurementAudio,
    );
  expect((await audio()).created).toBe(0);
  const time = page.getByRole("slider", { name: "Observation time", exact: true });
  await time.press("Home");
  await listen.click();
  await expect(page.getByRole("button", { name: "Mute water level", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => (await audio()).pitches.length).toBe(1);
  await page.waitForTimeout(250);
  await time.press("End");
  await expect.poll(async () => (await audio()).pitches.length).toBe(2);
  const pitches = (await audio()).pitches;
  expect(pitches[1]).toBeGreaterThan(pitches[0]!);
  await page.getByRole("button", { name: "Back to Observatory", exact: true }).click();
  await expect.poll(async () => (await audio()).closed).toBe(1);
  await openStories(page);
  await page.getByRole("button", { name: "Tide Watch", exact: true }).click();
  await expect(listen).toHaveAttribute("aria-pressed", "false");
  expect((await audio()).created).toBe(1);
});

test("long observation times stay clear of playback and onward links remain reachable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => route.abort());
  await page.goto("/#v=observe&story=rain");
  const transport = page.locator(".observation-transport");
  const play = transport.getByRole("button", { name: "Replay", exact: true });
  await expect(play).toBeVisible();
  const clear = await transport.evaluate((element) => {
    const copy = element.querySelector("span")!;
    const range = document.createRange();
    range.selectNodeContents(copy);
    const button = element.querySelector("button")!.getBoundingClientRect();
    return [...range.getClientRects()].every(
      (rect) => rect.bottom <= button.top || rect.top >= button.bottom || rect.right <= button.left - 6,
    );
  });
  expect(clear).toBe(true);
  await page.getByText("Keep exploring", { exact: true }).click();
  await expect(page.locator(".related-stories button")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("heading", { name: "Rainbelt", exact: true })).toBeAttached();
});
