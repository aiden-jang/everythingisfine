import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

const camera = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe: {
          state: () => { lon: number; lat: number; zoom: number };
          guidance: { read: () => boolean };
        };
      }
    ).__globe;
    return { ...globe.state(), manual: globe.guidance.read() };
  });

test("an interrupted journey resumes its current moment without replacing the globe @dev", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#v=observe&story=seafloor");
  const panel = page.getByRole("region", { name: "Seafloor Flight", exact: true });
  const time = panel.getByRole("slider").first();
  await panel.getByRole("button", { name: "Restart", exact: true }).click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await page.mouse.move(1100, 350);
  await page.mouse.wheel(0, -180);
  const resume = page.getByRole("button", { name: "Resume journey", exact: true });
  await expect(resume).toBeVisible();
  const held = Number(await time.inputValue());
  expect((await camera(page)).manual).toBe(true);
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(time).toHaveValue(String(held));
  await resume.click();
  expect(Number(await time.inputValue())).toBeGreaterThanOrEqual(held);
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(held);
  expect((await camera(page)).manual).toBe(false);
  await expect(resume).toBeHidden();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("journey-playback-desktop.png") });
});

test("a delayed story keeps the globe usable and cannot reopen after returning @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*aral*.json*", async (route) => {
    if (route.request().resourceType() === "fetch") await held;
    await route.continue();
  });
  await page.goto("/");
  await openStories(page, "search");
  await page.getByRole("searchbox", { name: "Find a story" }).fill("Aral");
  const trigger = page.locator("#search-story-aral");
  const before = await camera(page);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const response = page.waitForResponse(
    (reply) => reply.url().includes("aral") && reply.request().resourceType() === "fetch",
  );
  try {
    await trigger.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Preparing the observations. You can still explore" }),
    ).toBeVisible();
    expect(await camera(page)).toEqual(before);
    await page.locator("#globe-view").focus();
    await page.keyboard.press("+");
    expect((await camera(page)).zoom).toBeGreaterThan(before.zoom);
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  } finally {
    release();
  }
  await response;
  await expect(page.getByRole("region", { name: "Vanishing Sea", exact: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Find a story" })).toHaveValue("Aral");
  await trigger.click();
  await expect(
    page.getByRole("region", { name: "Vanishing Sea", exact: true }).getByRole("slider"),
  ).toBeVisible();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

for (const width of [1440, 390]) {
  test(`onward stories return to the original category, query and viewpoint at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await openStories(page, "search");
    const search = page.getByRole("searchbox", { name: "Find a story" });
    await search.fill("Aral");
    const trigger = page.locator("#search-story-aral");
    await trigger.scrollIntoViewIfNeeded();
    const before = await camera(page);
    const scroll = await page.locator("#observatory-intro").evaluate((el) => el.scrollTop);
    await trigger.click();
    const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
    await expect(panel.getByRole("slider")).toBeVisible();
    await panel.getByText("Keep exploring", { exact: true }).click();
    await panel.locator(".related-stories button").click();
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(search).toHaveValue("Aral");
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("button", { name: "Live Earth", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => camera(page)).toEqual(before);
    await expect.poll(() => page.locator("#observatory-intro").evaluate((el) => el.scrollTop)).toBe(scroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`returned-stories-${width}.png`) });
  });
}

for (const width of [1440, 390, 320]) {
  test(`playback follows the scrubber and the phone panel has one action at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { empty: true });
    await page.route("https://erddap.marine.ie/**", (route) => route.abort());
    await page.goto("/#v=explore");
    await expect(page.getByRole("tab", { name: "Stories", exact: true })).toBeVisible();
    if (width < 768) {
      const navigation = page.getByRole("navigation", { name: "Explore", exact: true });
      await expect(navigation.getByRole("button")).toHaveCount(1);
      await expect(navigation.getByRole("button", { name: "Collapse panel" })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: test.info().outputPath(`panel-${width}.png`) });
    }
    await openStories(page, "search");
    await page.getByRole("searchbox", { name: "Find a story" }).fill("Float Dive");
    await page.locator("#search-story-float").click();
    const transport = page.locator(".float-transport");
    await expect(transport).toBeVisible();
    await transport.scrollIntoViewIfNeeded();
    const scrubber = (await transport.getByRole("slider").boundingBox())!;
    const play = transport.getByRole("button", { name: "Play", exact: true });
    const button = (await play.boundingBox())!;
    expect(button.y).toBeGreaterThanOrEqual(scrubber.y + scrubber.height);
    expect(button.height).toBeGreaterThanOrEqual(44);
    await play.click();
    await expect(transport.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await transport.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(play).toBeVisible();
    const panel = page.locator("#observatory-intro");
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await panel.evaluate((node) => node.scrollLeft)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`playback-${width}.png`) });
  });
}
