import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("River Pulse highlights a gauge, keeps gaps and saves the exact USGS reading on either projection", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://api.waterdata.usgs.gov/**", (route) => {
    const url = new URL(route.request().url());
    const upper = url.href.includes("01327750");
    if (url.pathname.includes("monitoring-locations"))
      return route.fulfill({ json: { geometry: { coordinates: upper ? [-73.6, 43.27] : [-73.7, 42.75] } } });
    return route.fulfill({
      json: {
        features: (upper ? [0, 30] : [0, 15, 30]).map((minute) => ({
          properties: {
            time: `2026-11-20T14:${String(minute).padStart(2, "0")}:00Z`,
            value: String((upper ? 2340 : 3100) + minute),
            unit_of_measure: "ft^3/s",
          },
        })),
      },
    });
  });
  await page.goto("/#v=observe&story=river");
  const panel = page.getByRole("region", { name: "River Pulse", exact: true });
  const clock = panel.getByRole("slider", { name: "Observation time" });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const gauges = panel.getByRole("group", { name: "River gauges" });
  const lower = gauges.getByRole("button", { name: /Green Island/ });
  const upper = gauges.getByRole("button", { name: /Fort Edward/ });
  await expect(upper).toHaveAttribute("aria-pressed", "true");
  const chart = panel.locator(".observation-chart");
  expect((await chart.locator(".chart-trace").first().getAttribute("d"))?.match(/M/g)).toHaveLength(2);
  await lower.hover();
  await expect(chart.locator(".chart-trace[data-secondary]")).toHaveAttribute("data-active", "true");
  await expect(upper).toHaveAttribute("aria-pressed", "true");
  await lower.press("Enter");
  await expect(lower).toHaveAttribute("aria-pressed", "true");
  await clock.press("ArrowLeft");
  await expect(upper).toContainText("No reading");
  await expect(lower).toContainText("3,115 ft³/s");
  await upper.click();
  await expect(panel.getByRole("button", { name: "Keep reading" })).toBeDisabled();
  await expect(chart.locator(".chart-sample")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 664 });
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await lower.click();
  await expect(chart.locator(".chart-sample")).toHaveCount(1);
  await panel.getByRole("button", { name: "Keep reading" }).click();
  await expect(panel.getByRole("button", { name: "Reading kept" })).toBeVisible();
  await page.locator("#open-saved-observations").click();
  const shelf = page.getByRole("dialog", { name: "Saved observations" });
  const card = shelf.getByRole("article");
  await expect(card).toContainText("Green Island");
  await expect(card).toContainText("3,115 ft³/s");
  await expect(card).toContainText("14:15 UTC");
  await expect(card.getByRole("link", { name: "USGS Water Data" })).toHaveAttribute("href", /USGS-01358000/);
  await shelf.getByRole("button", { name: "Reopen this moment" }).click();
  await expect(lower).toHaveAttribute("aria-pressed", "true");
  await expect(clock).toHaveValue("1");
  await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
