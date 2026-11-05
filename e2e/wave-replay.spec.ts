import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function startWave(page: Page) {
  await installFeeds(page, {
    usgs: [
      {
        id: "wave-demo",
        properties: {
          mag: 4.2,
          place: "Channel Islands, California",
          time: Date.now() - 900_000,
          updated: 1,
          magType: "mww",
          type: "earthquake",
        },
        geometry: { coordinates: [-119.75, 34, 20] },
      },
    ],
  });
  await page.goto("/#at=-119,34,1&m=2&w=24&s=usgs&r=thermal&e=usgs:wave-demo");
  const details = page.getByRole("complementary", { name: "Pinned earthquake" });
  await details.getByText("Follow the wave", { exact: true }).click();
  await details.getByLabel("City").selectOption({ label: "Los Angeles · 140 km" });
  const play = details.getByRole("button", { name: "Play wave" });
  await play.click();
  return { details, play, replay: page.getByRole("region", { name: "Wave replay" }) };
}

test("a selected city receives both modeled waves and Escape returns to the event", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { replay, play } = await startWave(page);
  await expect(replay).toContainText("Los Angeles");
  await expect(replay.getByText("P wave", { exact: true })).toBeVisible();
  await expect(replay.getByText("S wave", { exact: true })).toBeVisible();
  await expect(replay).toContainText("Both arrived");
  if (process.env["EIF_CAPTURE_MOTION"] === "1") {
    await page.screenshot({ path: info.outputPath("wave-desktop.png") });
  }
  await expect(replay.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(replay).toBeHidden();
  await expect(play).toBeFocused();
});

test("reduced motion shows a fixed route and both arrival times on a phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { replay, details } = await startWave(page);
  await expect(replay).toContainText("Both arrived");
  await expect(replay.getByRole("button", { name: "Pause" })).toHaveCount(0);
  if (process.env["EIF_CAPTURE_MOTION"] === "1") {
    await page.screenshot({ path: info.outputPath("wave-phone.png") });
  }
  await replay.getByRole("button", { name: "Close wave replay" }).click();
  await expect(replay).toBeHidden();
  await expect(details).toBeVisible();
});
