import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installFeeds, revealStoryTools, saveImageButton } from "./feeds";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
  "base64",
);

for (const width of [1440, 390]) {
  test(`world radar keeps the globe, scrubs real frame times and recovers missing tiles at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    const now = Math.floor(Date.now() / 600_000) * 600_000;
    const times = [now - 1200_000, now - 600_000, now];
    let missing = true;
    const requests: string[] = [];
    await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) =>
      route.fulfill({
        json: {
          host: "https://tilecache.rainviewer.com",
          radar: { past: times.map((at, i) => ({ time: at / 1000, path: `/v2/radar/frame${i}` })) },
        },
      }),
    );
    await page.route("https://tilecache.rainviewer.com/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      return missing && path === "/v2/radar/frame1/512/1/0/0/2/1_0.png"
        ? route.fulfill({ status: 503 })
        : route.fulfill({ contentType: "image/png", body: pixel });
    });
    await page.route("**/radar_base_reflectivity_time/ImageServer/query?**", (route) =>
      route.fulfill({ json: { features: [] } }),
    );
    await page.goto("/");
    await revealStoryTools(page);
    const canvas = page.locator("#globe-view canvas");
    const original = await canvas.elementHandle();
    await page.getByRole("button", { name: "Storm Radar", exact: true }).click();
    const scene = page.getByRole("region", { name: "Storm Radar" });
    const status = scene.getByRole("status", { name: "Radar status" });
    await expect(status).toHaveText("Select a time to compare the observed scans.");
    await expect(scene.getByLabel("Coverage", { exact: true })).toHaveValue("global");
    await expect(
      page
        .getByRole("group", { name: "Radar on the globe" })
        .getByRole("link", { name: "Weather data by RainViewer" }),
    ).toBeInViewport();
    await expect(scene.getByText(/Striped areas have no listed radar coverage/)).toBeVisible();
    await scene.getByLabel("Radar region").selectOption("europe");
    await expect(scene.getByRole("heading", { name: "Europe", exact: true })).toBeVisible();
    await scene.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.getByRole("group", { name: "Radar on the map" })).toBeVisible();
    const slider = scene.getByRole("slider", { name: "Radar scan time" });
    const time = scene.locator(".radar-clock time");
    await slider.press("ArrowLeft");
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    await expect(status).toContainText("This scan’s image is unavailable.");
    await expect(await saveImageButton(page)).toBeDisabled();
    missing = false;
    await scene.getByRole("button", { name: "Retry RainViewer" }).click();
    await expect(status).toHaveText("Select a time to compare the observed scans.");
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    await slider.press("Home");
    await expect(time).toHaveAttribute("datetime", new Date(times[0]!).toISOString());
    await scene.getByRole("button", { name: "Play scans" }).click();
    await expect(scene.getByText("Latest frame", { exact: true })).toBeVisible();
    await expect(time).toHaveAttribute("datetime", new Date(times[2]!).toISOString());
    expect(requests.filter((path) => path.includes("coverage"))).toHaveLength(4);
    expect(requests).toHaveLength(17);
    await scene.getByLabel("Coverage", { exact: true }).selectOption("us");
    await expect(page.getByText("Contiguous United States", { exact: true })).toBeVisible();
    await scene.getByLabel("Coverage", { exact: true }).selectOption("global");
    await expect(status).toHaveText("Select a time to compare the observed scans.");
    expect(requests).toHaveLength(17);
    await scene.getByLabel("Radar region").selectOption("asia");
    await expect(scene.getByRole("heading", { name: "East Asia", exact: true })).toBeVisible();
    expect(await canvas.evaluate((node, first) => node === first, original)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const audit = await new AxeBuilder({ page }).include(".observatory-intro[data-storm-radar]").analyze();
    expect(audit.violations).toEqual([]);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/global-radar-${width}.png` });
    await scene.getByRole("button", { name: "Back to Live Earth" }).click();
    expect(await canvas.evaluate((node, first) => node === first, original)).toBe(true);
  });
}
