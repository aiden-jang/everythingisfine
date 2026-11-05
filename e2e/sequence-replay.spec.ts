import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function openSequence(page: Page) {
  const now = Date.now();
  const fixture = [
    { id: "older", lon: 141.1, lat: 38.25, age: 120, mag: 3.8 },
    { id: "pin", lon: 141.7, lat: 38.4, age: 70, mag: 6.1 },
    { id: "later", lon: 142.05, lat: 38.7, age: 38, mag: 4.7 },
    { id: "latest", lon: 142.5, lat: 38.88, age: 20, mag: 4.2 },
    { id: "elsewhere", lon: 145, lat: 41, age: 32, mag: 5.1 },
  ];
  await installFeeds(page, {
    usgs: fixture.map((event) => ({
      id: `sequence-${event.id}`,
      properties: {
        mag: event.mag,
        place: "Near the east coast of Honshu, Japan",
        time: now - event.age * 60_000,
        updated: 1,
        magType: "mww",
        type: "earthquake",
      },
      geometry: { coordinates: [event.lon, event.lat, 20] },
    })),
  });
  await page.goto("/#at=142,38,1&m=2&w=24&s=usgs&r=thermal&e=usgs:sequence-pin");
  const details = page.getByRole("complementary", { name: "Pinned earthquake" });
  const trigger = details.getByRole("button", { name: "Replay sequence" });
  await trigger.click();
  return { replay: page.getByRole("region", { name: "Sequence replay" }), trigger };
}

test("sequence replay holds the full regional cluster and restores the pinned panel", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { replay, trigger } = await openSequence(page);
  await expect(replay).toContainText("4 / 4 events");
  await expect(replay.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await expect(replay).toContainText("Full sequence");
  if (process.env["EIF_CAPTURE_MOTION"] === "1") {
    await page.screenshot({ path: info.outputPath("sequence-desktop.png") });
  }
  await replay.getByRole("slider", { name: "Sequence time" }).fill("500");
  await expect(replay).toContainText("Pinned quake");
  await expect(replay).toContainText("2 / 4 events");
  if (process.env["EIF_CAPTURE_MOTION"] === "1") {
    await page.screenshot({ path: info.outputPath("sequence-pin.png") });
  }
  await page.keyboard.press("Escape");
  await expect(replay).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a phone can scrub the recorded timeline in reduced motion", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { replay } = await openSequence(page);
  await expect(replay).toContainText("4 / 4 events");
  const slider = replay.getByRole("slider", { name: "Sequence time" });
  const last = await slider.getAttribute("aria-valuetext");
  await slider.press("Home");
  await expect(replay).toContainText("1 / 4 events");
  await expect(slider).not.toHaveAttribute("aria-valuetext", last!);
  await slider.press("End");
  await expect(replay).toContainText("4 / 4 events");
  await expect(slider).toHaveAttribute("aria-valuetext", last!);
  if (process.env["EIF_CAPTURE_MOTION"] === "1") {
    await page.screenshot({ path: info.outputPath("sequence-phone.png") });
  }
});
