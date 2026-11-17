import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("a kept pressure reading exports its source card and reopens the same station and minute", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const at = Date.parse("2022-01-15T08:59:00Z");
  await page.goto(`/#v=observe&story=tonga&t=${at}&choice=PHNL&p=map`);
  const story = page.getByRole("region", { name: "Tonga’s shockwave", exact: true });
  await expect(story.getByRole("slider", { name: "Replay time", exact: true })).toHaveValue("539");
  await story.getByRole("button", { name: "Keep this observation", exact: true }).click();
  await expect(story.getByRole("status", { name: "Kept pressure status" })).toContainText(
    "Saved on this device",
  );
  const savedTrigger = page.locator("#open-saved-observations");
  await savedTrigger.click();
  await expect(page.getByRole("region", { name: "Saved observations", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Saved observations", exact: true })).toHaveCount(0);
  await expect(savedTrigger).toBeFocused();
  await expect(story.getByRole("slider", { name: "Replay time", exact: true })).toHaveValue("539");
  await page.goto("/");
  await page.locator("#open-saved-observations").click();
  const collection = page.getByRole("region", { name: "Saved observations", exact: true });
  const card = collection.getByRole("article");
  await expect(card).toContainText("1017.75 hPa");
  await expect(card).toContainText("Honolulu");
  await expect(card).toContainText("15 Jan 2022, 08:59 UTC");
  await expect(card.getByRole("link", { name: "ASOS / Iowa Environmental Mesonet" })).toHaveAttribute(
    "href",
    "https://mesonet.agron.iastate.edu/request/asos/1min.phtml",
  );
  await collection.getByText("Add a thought (optional)", { exact: true }).click();
  await collection
    .getByRole("textbox", { name: "What did you notice?" })
    .fill("The same event was recorded across the Pacific.");
  const saveNote = collection.getByRole("button", { name: "Save note", exact: true });
  await saveNote.click();
  await expect(saveNote).toBeFocused();
  await expect(collection.getByRole("textbox", { name: "What did you notice?" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("saved-pressure-reading.png") });
  const downloadEvent = page.waitForEvent("download");
  await collection.getByRole("button", { name: "Download card", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(test.info().outputPath("pressure-evidence.png"));
  const path = await download.path();
  expect(path).not.toBeNull();
  const png = await readFile(path!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
  await collection.getByRole("button", { name: "Reopen this moment", exact: true }).click();
  await expect(collection).toHaveCount(0);
  await expect(story.getByRole("slider", { name: "Replay time", exact: true })).toHaveValue("539");
  await expect(story.getByRole("combobox", { name: "Ground station" })).toHaveValue("PHNL");
  await expect(story.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(story.locator(".tonga-chart-meta").first()).toContainText("1017.75 hPa");
});
