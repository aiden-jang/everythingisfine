import { expect, test, type Page } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

/*
 * DESIGN.md section 13, as a test rather than as a list.
 *
 * An audit performed once is worth very little. Two of these rules were broken by accident during the build
 * and neither was broken by a decision: the magnitude slider rendered a saturated blue thumb because
 * `accent-color` defaults to the platform highlight, and a dense cluster clipped to pure white under
 * additive blending.
 *
 * The rules that can be expressed as assertions are; the ones that need eyes are named at the bottom.
 */

const BREAKPOINTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  // Landscape, because portrait was the only shape this band was ever measured in. The strip layout lives
  // from 768 to 1279, and wide and short is the same band with a third of the height - where the strip had
  // quietly grown to half the viewport.
  { name: "tablet landscape", width: 1024, height: 768 },
  /*
   * A rotated phone, which is a real device state and the shortest shape anybody holds. 812 crosses into the
   * strip band, so a sideways phone gets the four-column layout in 375px of height.
   */
  { name: "phone landscape", width: 812, height: 375 },
  { name: "desktop", width: 1280, height: 820 },
] as const;

/**
 * Chroma of every colour the chrome paints, measured from the rendered page. The canvas is excluded, because
 * that is where hue belongs.
 *
 * Absolute chroma, not saturation. HSV saturation failed on the palette it was written to protect: `Deck` is
 * `#0D1420`, whose channels differ by 19 out of 255, and relative saturation calls that 0.59 because the
 * colour is nearly black. On absolute spread the whole chrome palette sits at or below 37 and a browser
 * default accent sits at 255.
 */
async function chromeHues(
  page: Page,
): Promise<{ tag: string; prop: string; colour: string; chroma: number }[]> {
  return page.evaluate(() => {
    const offenders: { tag: string; prop: string; colour: string; chroma: number }[] = [];

    const chromaOf = (value: string): number | null => {
      const m = value.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/);
      if (!m) return null;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const alpha = m[4] === undefined ? 1 : Number(m[4]);
      // Fully transparent paints nothing, so it cannot be an offence.
      if (alpha < 0.02) return null;
      // Weighted by alpha: a 6% wash of a strong hue is not a coloured button.
      return (Math.max(r, g, b) - Math.min(r, g, b)) * alpha;
    };

    for (const el of Array.from(document.querySelectorAll("*"))) {
      // Two exclusions, both named in DESIGN.md rather than assumed here. Excluding a specific marked element
      // rather than loosening the threshold keeps every other pixel of chrome under the same rule.
      if (el.closest("canvas") || el.tagName === "CANVAS") continue;
      if (el.closest("[data-ramp]")) continue;
      const style = getComputedStyle(el);
      const props: [string, string][] = [
        ["color", style.color],
        ["background-color", style.backgroundColor],
        ["border-top-color", style.borderTopColor],
        ["outline-color", style.outlineColor],
        ["accent-color", style.accentColor],
      ];
      for (const [prop, value] of props) {
        const s = chromaOf(value);
        if (s === null) continue;
        // 55 sits well above the whole chrome palette (Coastline and Instrument Faint tie at 37)
        // and far below anything that reads as a colour: a default browser accent is 255.
        if (s > 55) {
          offenders.push({ tag: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 70), prop, colour: value, chroma: Number(s.toFixed(1)) });
        }
      }
    }
    return offenders;
  });
}

for (const bp of BREAKPOINTS) {
  test(`the chrome carries no hue at ${bp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await installFeeds(page);
    await page.goto("/");
    await waitForData(page);

    // With something pinned, so the detail panel is audited too rather than skipped for being
    // absent, which is exactly how a panel ends up the one place a stray colour survives.
    const items = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button");
    await items.first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".zone-panel")).toBeVisible();

    expect(await chromeHues(page)).toEqual([]);
  });

  test(`the page does not scroll at ${bp.name}`, async ({ page }) => {
    // Measured by trying to scroll, not by reading a height. The sideways test below reads scrollWidth and
    // passed throughout while the document was 3,486px tall against a 940px viewport.
    await page.setViewportSize({ width: bp.width, height: bp.height ?? 900 });
    await installFeeds(page);
    await page.goto("/");
    await page.waitForTimeout(1_500);
    // A real wheel, not `scrollTo`: `overflow: hidden` still honours programmatic scrolling, so the
    // first version of this test failed on a page a user could not actually move.
    await page.mouse.move(bp.width / 2, (bp.height ?? 900) / 2);
    await page.mouse.wheel(0, 1_200);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => { window.scrollTo(0, 2_000); });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`nothing overflows sideways at ${bp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await installFeeds(page);
    await page.goto("/");
    await waitForData(page);

    // A build failure, per DESIGN.md section 7, not a cosmetic bug.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      widest: Math.max(...Array.from(document.querySelectorAll("body *"))
        .map((el) => Math.round(el.getBoundingClientRect().right))),
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.inner);
    expect(overflow.widest).toBeLessThanOrEqual(overflow.inner + 1);
  });

  test(`every control is reachable at ${bp.name}`, async ({ page }) => {
    /*
     * The invariant the other two tests do not ask. Neither "nothing overflows sideways" nor "the page does
     * not scroll" catches a control sitting above the top of the viewport with nothing scrollable around it,
     * which is how the legend broke: the magnitude slider sat 104px off the top of the screen and both passed.
     *
     * A control is reachable if its box is inside the viewport or some ancestor scrolls, because the rail
     * below 768px is deliberately a sheet you scroll.
     */
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await installFeeds(page);
    await page.goto("/");
    await waitForData(page);
    // Long enough for the entrance to settle, or the band is measured mid-animation.
    await page.waitForTimeout(1_000);

    const unreachable = await page.evaluate(() => {
      /*
       * A scrolling ancestor only counts if it is itself on screen. Passing any control with a scrollable
       * ancestor was too generous: Playwright reported `done scrolling` then `element is outside of the
       * viewport` on a rail row.
       */
      const scrollable = (el: Element): boolean => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const overflow = getComputedStyle(node).overflowY;
          if ((overflow !== "auto" && overflow !== "scroll")
            || node.scrollHeight <= node.clientHeight + 1) continue;
          const box = node.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0
            && box.left < window.innerWidth && box.right > 0) return true;
        }
        return false;
      };
      const bad: { tag: string; text: string; top: number; bottom: number }[] = [];
      for (const el of Array.from(
        document.querySelectorAll("button, a[href], summary, input:not([type=hidden])"),
      )) {
        /*
         * A zero box is not the only way to be off screen. A closed `<details>` hides its contents with
         * `content-visibility`, and descendants of one still report a full-size rect from
         * `getBoundingClientRect` - laid out, never painted. Folding the key by default surfaced fifty of
         * them at once, all of them "unreachable" and none of them on screen. `checkVisibility` is the
         * question actually being asked: can a reader see this at all.
         */
        if (!(el as HTMLElement).checkVisibility()) continue;
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.width === 0) continue;
        const inside = box.top >= -1 && box.bottom <= window.innerHeight + 1
          && box.left >= -1 && box.right <= window.innerWidth + 1;
        if (inside || scrollable(el)) continue;
        bad.push({
          tag: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}"`,
          text: el.id, top: Math.round(box.top), bottom: Math.round(box.bottom),
        });
      }
      return bad;
    });
    expect(unreachable).toEqual([]);
  });
}

test("every control clears 44px where there is a finger", async ({ browser }) => {
  /*
   * Emulated with a real coarse pointer, not merely at a phone width. DESIGN.md asks for 44px touch targets,
   * and asserting it at desktop width with a mouse measures the wrong thing: the rule is scoped to
   * `pointer: coarse` in CSS, so the test has to be too.
   */
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await installFeeds(page);
  await page.goto("http://localhost:31600");
  await waitForData(page);
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);

  /*
   * The list shipped at 31px a row and the filter buttons at 27px. Found by measuring after somebody said the
   * list looked bad, which is not a process that scales.
   *
   * The slider is exempt: its hit area is the 18px track, and browsers give range inputs a generous invisible
   * target that `getBoundingClientRect` does not report.
   */
  const small = await page.evaluate(() => {
    const bad: { tag: string; height: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("button, a[href]"))) {
      const box = el.getBoundingClientRect();
      if (box.height === 0) continue;
      if (box.height < 44) {
        bad.push({
          tag: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 28)}"`,
          height: Math.round(box.height),
        });
      }
    }
    return bad;
  });
  expect(small).toEqual([]);
  await context.close();
});

test("every number that updates has tabular figures", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const proportional = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll(".zone-rail *, .zone-panel *, header *"))) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? "").trim();
      if (!/\d/.test(text)) continue;
      const style = getComputedStyle(el);
      const mono = /mono/i.test(style.fontFamily);
      if (!mono && !style.fontVariantNumeric.includes("tabular-nums")) bad.push(text.slice(0, 40));
    }
    return bad;
  });
  // A counter that updates every second visibly jitters its own width without them, which is the
  // difference between a readout that looks solid and one that looks twitchy.
  expect(proportional).toEqual([]);
});

test("no user-agent defaults left in the chrome", async ({ page }) => {
  // The two that were. `::selection` was unstyled, so dragging across a place name painted the browser's
  // saturated blue. Scrollbars were unstyled, invisible on macOS overlay scrollbars and a light channel down
  // the darkest element on Windows, which is how it survived being looked at.
  await installFeeds(page);
  await page.goto("/");

  const rules = await page.evaluate(() => {
    const all: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) all.push(rule.cssText);
      } catch { /* cross-origin sheet, none here */ }
    }
    return all.join("\n");
  });

  expect(rules).toContain("::selection");
  expect(rules).toContain("scrollbar-color");

  const scroller = page.locator(".zone-rail .overflow-y-auto").first();
  await expect(scroller).toHaveCSS("scrollbar-width", "thin");
});

test("a shared link previews as something", async ({ page }) => {
  // Permalinks are a headline feature and every one of them rendered as a bare URL in every client
  // it was pasted into.
  await installFeeds(page);
  await page.goto("/");
  const meta = async (attr: string, value: string): Promise<string | null> =>
    page.locator(`meta[${attr}="${value}"]`).getAttribute("content");

  expect(await meta("property", "og:title")).toBe("Everything Is Fine");
  expect(await meta("property", "og:image")).toMatch(/^https:\/\/.+\/share\.png$/);
  expect(await meta("property", "og:image:alt")).toBeTruthy();
  expect(await meta("name", "twitter:card")).toBe("summary_large_image");

  const res = await page.request.get("/share.png");
  expect(res.status()).toBe(200);
  expect(Number(res.headers()["content-length"] ?? 0)).toBeGreaterThan(10_000);
});

test("the globe always gets a real share of the screen", async ({ page }) => {
  // The tablet band gave the rail an `auto` row and the canvas the remainder. On a 900 by 700 laptop that
  // remainder was 153px, and every screenshot of the band had been taken tall enough to hide it.
  await installFeeds(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });

  for (const [w, h] of [[768, 640], [900, 700], [1279, 700], [1280, 820], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const share = await page.evaluate(() =>
      (document.querySelector("canvas") as HTMLElement).getBoundingClientRect().height
      / window.innerHeight);
    // The desktop layout gives the globe nearly everything; the tablet band is the constrained one.
    expect(share, `canvas share at ${w}x${h}`).toBeGreaterThanOrEqual(0.44);
  }
});

test("nothing is painted pure black", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const blacks = await page.evaluate(() => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      for (const value of [style.backgroundColor, style.color]) {
        if (/^rgba?\(0,\s*0,\s*0(,\s*1)?\)$/.test(value)) {
          found.push(`${el.tagName.toLowerCase()} ${value}`);
        }
      }
    }
    return found;
  });
  // True black kills the sense of depth on a sphere and leaves the rim light nowhere to fall off.
  expect(blacks).toEqual([]);
});

test("the colourblind ramp survives a reload", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const toggle = page.getByRole("button", { name: /colourblind ramp/i });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await waitForData(page);
  // Persisted, because re-choosing an accessibility setting every visit is its own barrier.
  await expect(page.getByRole("button", { name: /colourblind ramp/i }))
    .toHaveAttribute("aria-pressed", "true");
});

/*
 * Left to eyes, deliberately. These are the section 13 rules a computer cannot judge:
 *
 *   - whether the globe reads as an instrument rather than a placeholder at tweet size;
 *   - whether the wavefront reads as arriving rather than decorating;
 *   - whether the copy contains a claim the data does not support.
 */

/*
 * Where the rail's blocks sit, which nothing asserted until five regressions had shipped past a green run.
 *
 * Each of these was found by hand, and one of them by the author rather than by me: the transport 5px under
 * the fold, the transport again after a footnote wrapped in the tablet column, the legend adrift in the
 * middle of the canvas, the legend clipping its own title under the header, and the event list entirely
 * below the fold. The suite checked that the canvas kept its share and that controls cleared 44px, and had
 * nothing to say about any of it.
 */
test("the rail's controls stay above its fold", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  /*
   * Measured against the rail's own box, not the viewport. The rail is a scroll container with
   * `contain: paint`, so a control 400px below its fold still reports a viewport position inside the
   * window - which is how this test passed for a year while saying something it could not see.
   */
  const seen = async (): Promise<{ transport: boolean; magnitude: boolean; window: boolean }> =>
    page.evaluate(() => {
      const rail = document.querySelector(".rail") as HTMLElement;
      const box = rail.getBoundingClientRect();
      const inRail = (sel: string): boolean => {
        const el = rail.querySelector(sel);
        if (!el) return false;
        const b = el.getBoundingClientRect();
        return b.height > 0 && b.top >= box.top - 1 && b.bottom <= box.bottom + 1;
      };
      return {
        transport: inRail("input.scrub-slider"),
        magnitude: inRail("#mag"),
        window: inRail('[role="group"][aria-label="Window"]'),
      };
    });

  /*
   * Where the rail is a tall column of its own, everything a person operates is on screen at once.
   * The transport is the whole time dimension and it has gone under twice, both times as a side effect
   * of something above it growing.
   */
  for (const [w, h] of [[1440, 900], [1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const now = await seen();
    expect(now.transport, `transport at ${w}x${h}`).toBe(true);
    expect(now.magnitude, `magnitude slider at ${w}x${h}`).toBe(true);
    expect(now.window, `window buttons at ${w}x${h}`).toBe(true);
  }

  /*
   * Below 1280 the rail lies down into a strip capped at 34dvh, or becomes a sheet under the globe on a
   * phone. Neither holds everything at once and neither is meant to, so the promise there is that the
   * controls are reachable by scrolling the rail rather than clipped out of it.
   */
  for (const [w, h] of [[1024, 768], [900, 1000], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelector("input.scrub-slider")!.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(200);
    const now = await seen();
    expect(now.transport, `transport reachable at ${w}x${h}`).toBe(true);
  }
});

test("the events are reachable, not clipped out of the rail", async ({ page }) => {
  /*
   * The rail cannot hold everything at once. With the timeline back in it, the column runs about 600px
   * past a 900px-tall screen, so at desktop widths the event list sits below the fold and you scroll to
   * it - deliberate, because the alternative was pushing the transport under instead, and that one has
   * regressed twice.
   *
   * What must never happen is the list being unreachable: clipped by a parent that does not scroll, or
   * rendered past the scroll height. So this scrolls the rail to the bottom and demands rows.
   */
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);

  for (const [w, h] of [[1440, 900], [1512, 982], [1024, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    // Rows wholly inside the rail's own box, so a list that merely exists below the fold does not count.
    const rows = await page.evaluate(() => {
      const rail = document.querySelector(".rail") as HTMLElement;
      rail.scrollTop = rail.scrollHeight;
      const box = rail.getBoundingClientRect();
      const list = rail.querySelector("section[aria-label='Recent earthquakes']");
      if (!list) return -1;
      return Array.from(list.querySelectorAll("button")).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      }).length;
    });
    expect(rows, `event rows reachable at ${w}x${h}`).toBeGreaterThan(0);
  }
});

