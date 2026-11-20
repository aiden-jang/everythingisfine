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
  await story.getByRole("button", { name: "Keep this reading", exact: true }).click();
  await expect(story.getByRole("status", { name: "Kept pressure status" })).toContainText(
    "Saved on this device",
  );
  const savedTrigger = page.locator("#open-saved-observations");
  await savedTrigger.click();
  await expect(page.getByRole("dialog", { name: "Saved observations", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Saved observations", exact: true })).toHaveCount(0);
  await expect(savedTrigger).toBeFocused();
  await expect(story.getByRole("region", { name: "Kept Tonga readings" })).toBeVisible();
  await page.goto("/");
  await page.locator("#open-saved-observations").click();
  const collection = page.getByRole("dialog", { name: "Saved observations", exact: true });
  const card = collection.getByRole("article");
  await expect(card).toContainText("1017.75 hPa");
  await expect(card).toContainText("Honolulu");
  expect((await collection.boundingBox())!.width).toBeLessThanOrEqual(420);
  await expect(card).toContainText("meanwhile.");
  await expect(card).toContainText(/15 Jan 2022(?:,| at) 08:59 UTC/);
  await expect(card.getByRole("link", { name: "ASOS / Iowa Environmental Mesonet" })).toHaveAttribute(
    "href",
    "https://mesonet.agron.iastate.edu/request/asos/1min.phtml",
  );
  await collection.getByText("Add a thought (optional)", { exact: true }).click();
  await collection
    .getByRole("textbox", { name: "What did you notice?" })
    .fill("The same event was recorded across the Pacific.");
  await expect(collection.getByText("Unsaved draft")).toBeVisible();
  await collection.getByRole("button", { name: "Close saved observations" }).click();
  await savedTrigger.click();
  await collection.getByText("Unsaved draft").click();
  await expect(collection.getByRole("textbox", { name: "What did you notice?" })).toHaveValue(
    "The same event was recorded across the Pacific.",
  );
  const saveNote = collection.getByRole("button", { name: "Save note", exact: true });
  await saveNote.focus();
  await saveNote.press("Enter");
  await expect(saveNote).toBeFocused();
  await expect(collection.getByText("Note saved.", { exact: true })).toBeVisible();
  await expect(collection.getByRole("textbox", { name: "What did you notice?" })).toBeVisible();
  if (process.env["EIF_CAPTURE_UI"])
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
  await expect(story.getByRole("slider", { name: "Station pressure time", exact: true })).toHaveValue("539");
  await expect(story.getByRole("combobox", { name: "Ground station" })).toHaveValue("PHNL");
  await expect(story.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(story.locator(".tonga-chart-meta").first()).toContainText("1017.75 hPa");
  await expect(story.locator(".tonga-chart-dot[data-kept-reading]")).toBeVisible();
  await expect(story.getByRole("button", { name: "Kept", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const samples = story.getByRole("slider", { name: "Station pressure time", exact: true });
  await samples.press("ArrowRight");
  await expect(story.getByRole("button", { name: "Keep this reading", exact: true })).toBeEnabled();
  await expect(story.getByText("Saved on this device.", { exact: true })).toHaveCount(0);
  await samples.press("ArrowLeft");
  await expect(story.getByRole("button", { name: "Kept", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await story.getByRole("button", { name: "Back to journey" }).click();
  await story.getByRole("button", { name: "Back to Saved" }).click();
  await expect(collection.getByRole("button", { name: "Reopen this moment" })).toBeFocused();
  await expect(collection.locator(".kept-item[data-returned]")).toContainText("1017.75 hPa");
});

test("two Float readings retain separate notes, focus and scroll after a phone reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  const profile = "recorded/6901932/268/1792482240000";
  await page.goto(`/#v=observe&story=float&choice=${profile}&chapter=200`);
  const depth = page.getByRole("slider", { name: "Ascent depth" });
  const note = page.getByRole("textbox", { name: "A note for this observation" });
  const keep = page.getByRole("button", { name: "Keep this observation", exact: true });
  await page.locator(".float-observation-note summary").click();
  await note.fill("Deep sample");
  await keep.click();
  await depth.press("ArrowRight");
  await expect(note).toHaveValue("");
  await note.fill("Next sample");
  await keep.click();
  await depth.press("ArrowLeft");
  await expect(note).toHaveValue("Deep sample");
  await note.fill("Edited deep sample");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kept", exact: true })).toBeVisible();
  await page.reload();
  await expect(depth).toHaveValue("200");
  await page.locator("#open-saved-observations").click();
  const collection = page.getByRole("dialog", { name: "Saved observations", exact: true });
  await expect(collection.getByRole("article")).toHaveCount(2);
  for (const [index, message] of [
    [201, "Next sample"],
    [200, "Edited deep sample"],
  ] as const) {
    const entry = page.locator(`[id="saved-entry-float:${profile}:${index}"]`);
    await entry.scrollIntoViewIfNeeded();
    const scroll = await collection.evaluate((el) => el.scrollTop);
    await entry.click();
    await expect(depth).toHaveValue(String(index));
    if (!(await note.isVisible())) await page.locator(".float-observation-note summary").click();
    await expect(note).toHaveValue(message);
    await page.getByRole("button", { name: "Back to Saved", exact: true }).click();
    await expect(entry).toBeFocused();
    expect(Math.abs((await collection.evaluate((el) => el.scrollTop)) - scroll)).toBeLessThan(2);
  }
  const remove = collection.getByRole("button", { name: "Remove saved Float Dive" });
  await remove.first().click();
  await expect(collection.getByRole("article")).toHaveCount(1);
  await collection.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(collection.getByRole("article")).toHaveCount(2);
  await collection.getByText("Recent journeys", { exact: true }).click();
  const recent = collection.locator("#saved-entry-recent-float");
  await recent.click();
  await page.getByRole("button", { name: "Back to Saved", exact: true }).click();
  await expect(recent).toBeFocused();
  await collection.getByRole("button", { name: "Close saved observations" }).click();
  await expect(depth).toHaveValue("200");
});

test("Saved can close while its first download is pending and opens cleanly after it arrives", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/SavedCollection(?:-|\.)/, async (route) => {
    await hold;
    await route.continue();
  });
  await page.goto("/");
  const open = page.locator("#open-saved-observations");
  const collection = page.getByRole("dialog", { name: "Saved observations", exact: true });
  try {
    await open.click();
    await expect(collection.getByRole("heading", { name: "What you noticed." })).toBeFocused();
    await expect(collection.getByRole("status")).toHaveText("Opening saved readings…");
    await page.keyboard.press("Escape");
    await expect(collection).toHaveCount(0);
    await expect(open).toBeFocused();
  } finally {
    release();
  }
  await open.click();
  await expect(collection.getByRole("button", { name: "Browse stories" })).toBeVisible();
  await expect(collection.getByRole("heading", { name: "What you noticed." })).toBeFocused();
});
