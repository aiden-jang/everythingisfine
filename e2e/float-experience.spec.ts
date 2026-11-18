import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installFeeds } from "./feeds";

const tetherError = (page: import("@playwright/test").Page) =>
  page.locator(".float-tether").evaluate((svg) => {
    const path = svg.querySelector("path")!;
    const point = path.getPointAtLength(path.getTotalLength());
    const matrix = (svg as SVGSVGElement).getScreenCTM()!;
    const circle = document.querySelector(".float-profile-sample")!.getBoundingClientRect();
    return Math.hypot(
      point.x * matrix.a + matrix.e - circle.left - circle.width / 2,
      point.y * matrix.d + matrix.f - circle.top - circle.height / 2,
    );
  });

test("normal-motion Float Dive keeps its measured sample and places map controls in Locate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page);
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  await page.goto("/#story=float&choice=recorded/6901932/268/1792482240000&chapter=317&v=observe");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  const depth = page.getByRole("slider", { name: "Ascent depth" });
  await expect(depth).toHaveValue("317");
  const reading = (await page.getByRole("region", { name: "Float Dive", exact: true }).boundingBox())!;
  const header = (await page.locator("#chrome-head").boundingBox())!;
  expect(reading.y).toBeGreaterThanOrEqual(header.y + header.height);
  await page.getByRole("button", { name: "View measured profile", exact: true }).click();
  const profile = page.getByRole("region", { name: "Measured float profile" });
  await expect(profile).toBeVisible();
  await expect(page.locator("[data-float-instrument]")).toHaveCSS("opacity", "1");
  await expect.poll(() => tetherError(page)).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath("float-inspect-desktop.png") });
  const sample = profile.getByRole("slider", { name: "Inspect profile sample" });
  await sample.press("End");
  await expect(depth).toBeHidden();
  await expect(sample).toHaveValue("596");
  await expect(page.locator("[data-float-depth]")).toContainText("3");
  await profile.getByRole("button", { name: "Salinity", exact: true }).click();
  await expect(profile.getByRole("img", { name: /Practical salinity by estimated depth/ })).toBeVisible();
  const projection = page.getByRole("group", { name: "Float projection" });
  await expect(projection).toBeHidden();
  await expect(sample).toHaveValue("596");
  const audit = await new AxeBuilder({ page })
    .include("#observatory-intro")
    .include(".float-profile")
    .include(".float-transport")
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(page.getByRole("button", { name: "View measured profile", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "View measured profile", exact: true }).click();
  await expect(profile.getByRole("button", { name: "Close measured profile", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(page.getByRole("button", { name: "View measured profile", exact: true })).toBeFocused();
  await page
    .getByRole("group", { name: "Float Dive chapters" })
    .getByRole("button", { name: "Locate", exact: true })
    .click();
  await expect(page.locator("[data-float-instrument]")).toHaveCSS("opacity", "0");
  await projection.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("p")).toBe("map");
  await page
    .getByRole("group", { name: "Float Dive chapters" })
    .getByRole("button", { name: "Rise", exact: true })
    .click();
  await expect(page.locator("[data-float-instrument]")).toHaveCSS("opacity", "1");
  await expect(projection).toBeHidden();
  await page.getByRole("button", { name: "View measured profile", exact: true }).click();
  const notice = page
    .getByRole("group", { name: "Float Dive chapters" })
    .getByRole("button", { name: "Notice", exact: true });
  await notice.click();
  await expect(profile).toBeHidden();
  await expect(notice).toBeFocused();
  expect(await canvas.evaluate((element, prior) => element === prior, original)).toBe(true);
});

test("profile inspection stays linked without animation frames and returns focus from a finding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  await page.addInitScript(() => {
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      frame((at) => {
        if (!document.documentElement.hasAttribute("data-hold-world-frames")) callback(at);
      });
  });
  await page.goto("/#story=float&choice=recorded/6901932/268/1792482240000&chapter=317&v=observe");
  const open = page.getByRole("button", { name: "View measured profile", exact: true });
  await open.click();
  const profile = page.getByRole("region", { name: "Measured float profile" });
  await expect(page.locator("[data-float-instrument]")).toHaveCSS("opacity", "1");
  await expect.poll(() => tetherError(page)).toBeLessThan(2);
  await page.evaluate(() => document.documentElement.setAttribute("data-hold-world-frames", ""));
  await profile.getByRole("button", { name: "Salinity", exact: true }).click();
  await expect.poll(() => tetherError(page)).toBeLessThan(2);
  expect(
    await profile.evaluate((element) => {
      element.scrollTop = 24;
      return element.scrollTop;
    }),
  ).toBe(24);
  await expect.poll(() => tetherError(page)).toBeLessThan(2);
  await page.evaluate(() => document.documentElement.removeAttribute("data-hold-world-frames"));
  await page
    .getByRole("group", { name: "Float Dive chapters" })
    .getByRole("button", { name: "Notice", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect this sample", exact: true }).click();
  await expect(profile.getByRole("button", { name: "Close measured profile", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(open).toBeFocused();
});

test("an unavailable shared Argo profile never claims an exact saved-moment restoration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  await page.goto("/#story=float&choice=recent/6901932/269/1793363040000&chapter=999&p=map&v=observe");
  const dive = page.getByRole("region", { name: "Float Dive", exact: true });
  await expect(dive.getByText("The saved profile could not be restored.", { exact: false })).toBeVisible();
  await expect(dive.getByText(/Recorded profile · Cycle 268/)).toBeVisible();
  await expect(dive.getByText("The saved sample is outside this profile.", { exact: false })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "About this shared view" })).toBeHidden();
  await expect(page.getByRole("group", { name: "Float projection" })).toBeHidden();
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("p")).toBe("map");
  const requested = "recent/6901932/269/1793363040000";
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("choice"))
    .toBe(requested);
  await page.reload();
  await expect(dive.getByText("The saved profile could not be restored.", { exact: false })).toBeVisible();
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("choice"))
    .toBe(requested);
  await dive.getByText("Profile & evidence", { exact: true }).click();
  await dive
    .getByRole("combobox", { name: "Float profile", exact: true })
    .selectOption("recorded/6901932/268/1792482240000");
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("choice"))
    .toBe("recorded/6901932/268/1792482240000");
});
