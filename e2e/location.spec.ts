import { expect, test, type Page, type Route } from "@playwright/test";
import { installFeeds } from "./feeds";

type LocationWindow = Window & {
  __globe?: { state: () => { lon: number; lat: number; zoom: number }; morph: () => number };
  locationRequests?: number;
  locationRequestSettled?: boolean;
};

const camera = (page: Page) => page.evaluate(() => (window as LocationWindow).__globe?.state());

async function setup(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
}

async function explore(page: Page) {
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: "Use device location", exact: true })).toBeVisible();
}

test("approximate arrival keeps rounded framing on the same globe and map @dev", async ({ page }) => {
  await setup(page);
  await page.route("**/api/location", (route) =>
    route.fulfill({ json: { location: { lon: 151.2093, lat: -33.8688 } } }),
  );
  await page.goto("/");
  await expect.poll(() => camera(page)).toMatchObject({ lon: 151.2, lat: -33.9 });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await explore(page);
  for (const name of ["Map", "Globe"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as LocationWindow).__globe?.morph()))
      .toBe(name === "Map" ? 1 : 0);
    await expect.poll(() => camera(page)).toMatchObject({ lon: 151.2, lat: -33.9 });
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
  }
  await page.getByRole("combobox", { name: "Choose a featured city", exact: true }).fill("Tokyo");
  await page.getByRole("button", { name: "Locate Tokyo", exact: true }).click();
  await expect.poll(async () => (await camera(page))?.lon).toBeCloseTo(139.7, 0);
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect.poll(() => camera(page)).toMatchObject({ lon: 151.2, lat: -33.9 });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
      exact: true,
    })
    .click();
  await expect.poll(() => camera(page)).toMatchObject({ lon: 151.2, lat: -33.9 });
});

test("a shared camera takes priority over the visitor's approximate location @dev", async ({ page }) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/location", (route) =>
    route.fulfill({ json: { location: { lon: 151.2, lat: -33.9 } } }),
  );
  await page.goto("/#v=explore&p=map&at=12.5,41.9,2");
  await expect.poll(() => page.evaluate(() => (window as LocationWindow).__globe?.morph())).toBe(1);
  await expect.poll(() => camera(page)).toEqual({ lon: 12.5, lat: 41.9, zoom: 2 });
  await page.getByRole("button", { name: "Globe", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as LocationWindow).__globe?.morph())).toBe(0);
  await expect.poll(() => camera(page)).toEqual({ lon: 12.5, lat: 41.9, zoom: 2 });
});

test("a late approximate-location response cannot undo manual camera movement @dev", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const request = args[0];
      const url = request instanceof Request ? request.url : String(request);
      try {
        return await fetch(...args);
      } finally {
        if (url.endsWith("/api/location")) (window as LocationWindow).locationRequestSettled = true;
      }
    };
  });
  let pending: Route | undefined;
  await page.route("**/api/location", (route) => {
    pending = route;
  });
  await page.goto("/");
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect.poll(() => camera(page)).toBeDefined();
  const before = (await camera(page))!;
  await page.locator("#globe-view").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await camera(page))?.lon).not.toBe(before.lon);
  const moved = await camera(page);
  await pending!.fulfill({ json: { location: { lon: 151.2, lat: -33.9 } } });
  await expect.poll(() => page.evaluate(() => (window as LocationWindow).locationRequestSettled)).toBe(true);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  expect(await camera(page)).toEqual(moved);
});

for (const width of [1440, 390]) {
  test(`device location is requested only on click and rounded before framing at ${width}px @dev`, async ({
    page,
    context,
  }) => {
    await setup(page, width);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ longitude: -73.985656, latitude: 40.748433 });
    await page.addInitScript(() => {
      const locate = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      (window as LocationWindow).locationRequests = 0;
      navigator.geolocation.getCurrentPosition = (...args) => {
        (window as LocationWindow).locationRequests!++;
        locate(...args);
      };
    });
    await page.goto("/");
    await expect.poll(() => camera(page)).toBeDefined();
    expect(await page.evaluate(() => (window as LocationWindow).locationRequests)).toBe(0);
    await explore(page);
    expect(await page.evaluate(() => (window as LocationWindow).locationRequests)).toBe(0);
    await page.getByRole("button", { name: "Use device location", exact: true }).click();
    await expect.poll(() => camera(page)).toMatchObject({ lon: -74, lat: 40.7 });
    expect(await page.evaluate(() => (window as LocationWindow).locationRequests)).toBe(1);
    const persisted = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, hash: location.hash }),
    );
    expect(persisted).not.toContain("73.985656");
    expect(persisted).not.toContain("40.748433");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("denied device location keeps the current view and city search usable @dev", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => {
      error?.({
        code: 1,
        message: "Permission denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    };
  });
  await page.goto("/");
  await explore(page);
  const before = await camera(page);
  await page.getByRole("button", { name: "Use device location", exact: true }).click();
  await expect(
    page.getByText("Location permission was denied. You can still choose a city.", { exact: true }),
  ).toBeVisible();
  expect(await camera(page)).toEqual(before);
  await page.getByRole("combobox", { name: "Choose a featured city", exact: true }).fill("Tokyo");
  await page.getByRole("button", { name: "Locate Tokyo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Observations around Tokyo" })).toBeVisible();
  await expect.poll(async () => (await camera(page))?.lon).toBeCloseTo(139.7, 0);
});
