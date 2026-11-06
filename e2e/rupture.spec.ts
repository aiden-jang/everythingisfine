import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("Tōhoku reveals the modeled fault before the estimated shaking", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Watch Tōhoku rupture" });
  await trigger.click();
  const reveal = page.getByRole("dialog", { name: "The Tōhoku rupture" });
  await expect(reveal.getByRole("heading", { name: "Off the coast of Honshu" })).toBeVisible();
  await expect(reveal.getByRole("heading", { name: "Modeled fault movement" })).toBeVisible();
  await reveal.getByRole("button", { name: "Pause reveal" }).click();
  await expect(reveal.getByRole("button", { name: "Resume reveal" })).toBeVisible();
  await expect(reveal.getByRole("heading", { name: "Modeled fault movement" })).toBeVisible();
  await reveal.getByRole("button", { name: "Resume reveal" }).click();
  await expect(reveal.getByRole("button", { name: "Replay reveal" })).toBeVisible();
  await expect(reveal.getByRole("heading", { name: "Estimated surface shaking" })).toBeVisible();
  await expect(reveal.getByText("Intensity · MMI")).toBeVisible();
  await expect(reveal.getByRole("img")).toBeVisible();
  const recorded = reveal.getByRole("button", { name: "Recorded waves", exact: true });
  await recorded.click();
  await expect(reveal.getByRole("heading", { name: "When Earth Rings" })).toBeVisible();
  await expect(reveal.getByRole("combobox", { name: "Second station" })).toHaveValue("5");
  await reveal.getByRole("button", { name: "Jump to ANMO onset" }).click();
  await expect(reveal.getByRole("slider")).toHaveAttribute("aria-valuetext", "05:58:56 UTC");
  await reveal.getByRole("combobox", { name: "Second station" }).selectOption({ label: "Oʻahu" });
  await expect(reveal.getByRole("img", { name: /Oʻahu, Hawaiʻi, normalized vertical motion/ })).toBeVisible();
  await reveal.getByRole("button", { name: "Back to surface shaking" }).click();
  await expect(recorded).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reveal).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Tōhoku archive exposes both maps on a small phone with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route(
    (url) =>
      url.hostname === "earthquake.usgs.gov" &&
      url.pathname.endsWith("/event/1/query") &&
      url.searchParams.get("starttime")?.startsWith("2011-03-11") === true,
    (route) =>
      route.fulfill({
        json: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "official20110311054624120_30",
              properties: {
                mag: 9.1,
                magType: "mww",
                place: "2011 Great Tohoku Earthquake, Japan",
                time: Date.UTC(2011, 2, 11, 5, 46, 24, 120),
                type: "earthquake",
              },
              geometry: { type: "Point", coordinates: [142.373, 38.297, 29] },
            },
          ],
        },
      }),
  );
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  await page.getByRole("button", { name: /Japan, 2011/ }).click();
  await expect(page).toHaveURL(/d=2011-03-11/);
  const pinned = page.getByRole("complementary", { name: "Pinned earthquake" });
  const trigger = pinned.getByRole("button", { name: "Watch Tōhoku rupture" });
  await trigger.click();
  const reveal = page.getByRole("dialog", { name: "The Tōhoku rupture" });
  await expect(reveal.getByRole("button", { name: "Modeled fault movement" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(reveal.getByRole("button", { name: /reveal/ })).toHaveCount(0);
  await expect(reveal.getByText("Depth exaggerated 4×")).toBeVisible();
  await reveal.getByRole("button", { name: "Estimated surface shaking", exact: true }).click();
  await expect(reveal.getByRole("heading", { name: "Estimated surface shaking" })).toBeVisible();
  await expect(reveal.getByRole("link", { name: "USGS ShakeMap" })).toBeVisible();
  const overflow = () =>
    reveal.evaluate((dialog) => [
      dialog.scrollWidth - dialog.clientWidth,
      dialog.scrollHeight - dialog.clientHeight,
    ]);
  await expect.poll(overflow).toEqual([0, 0]);
  await reveal.getByRole("button", { name: "Recorded waves", exact: true }).click();
  const comparison = reveal.locator(".recorded-waves");
  await expect(comparison.getByRole("img", { name: /Albuquerque, New Mexico, normalized/ })).toBeVisible();
  expect(
    await comparison.evaluate((figure) =>
      Array.from(figure.querySelectorAll(".recorded-trace svg")).every(
        (trace) => trace.getBoundingClientRect().bottom <= figure.getBoundingClientRect().bottom,
      ),
    ),
  ).toBe(true);
  await reveal.getByRole("button", { name: "Back to surface shaking" }).click();
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(overflow).toEqual([0, 0]);
  await reveal.getByRole("button", { name: "Close" }).click();
  await expect(reveal).toBeHidden();
  await expect(trigger).toBeFocused();
});
