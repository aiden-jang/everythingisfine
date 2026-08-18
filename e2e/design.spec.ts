import { expect, test, type Page } from "@playwright/test";

/*
 * DESIGN.md section 13, as a test rather than as a list.
 *
 * Phase C in PLAN.md is a visual audit: walk the app and confirm nothing on the banned list has
 * crept in. An audit performed once is worth very little, because everything it checks can come
 * back the next afternoon. Two of these rules have already been broken by accident during this
 * build, and neither was broken by a decision:
 *
 *   - the magnitude slider rendered a saturated blue thumb, because `accent-color` defaults to the
 *     platform highlight and nobody overrode it;
 *   - a dense cluster clipped to pure white under additive blending, which is the chrome colour.
 *
 * Both were caught by looking. Neither would have been caught twice. So the rules that can be
 * expressed as assertions are expressed as assertions, and the ones that genuinely need eyes are
 * named at the bottom rather than pretended away.
 */

async function waitForData(page: Page): Promise<void> {
  const counter = page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first();
  await expect(counter).not.toHaveText("0", { timeout: 30_000 });
}

const BREAKPOINTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 820 },
] as const;

/**
 * Chroma of every colour the chrome paints, measured from the rendered page.
 *
 * The canvas is excluded, because that is where hue belongs. Everything else is chrome, and
 * DESIGN.md section 3 gives chrome no hue at all: stricter than "one accent", and the rule that
 * lets a viewer tell at a glance whether a colour is telling them something.
 *
 * **Absolute chroma, not saturation.** The first version measured HSV saturation and failed on the
 * palette it was written to protect: `Deck` is `#0D1420`, whose channels differ by 19 out of 255,
 * and relative saturation calls that 0.59 because the colour is nearly black. Every dark tint
 * scores high that way. What actually distinguishes a barely-tinted grey from a blue button is the
 * absolute spread between channels, and on that measure the entire chrome palette sits at or below
 * 37 while a browser default accent sits at 255.
 *
 * A test that fails on correct code is worse than no test: it teaches people to skip the suite.
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
      /*
       * Two exclusions, both named in DESIGN.md rather than assumed here.
       *
       * The canvas is where hue belongs. The legend is the one element outside it allowed to paint
       * the ramp, because a legend that cannot show the colours it is explaining is not a legend.
       * Excluding a specific marked element rather than loosening the threshold keeps every other
       * pixel of chrome under the same rule.
       */
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

  test(`nothing overflows sideways at ${bp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
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
}

test("every control clears 44px where there is a finger", async ({ browser }) => {
  /*
   * Emulated with a real coarse pointer, not merely at a phone width.
   *
   * DESIGN.md asks for 44px *touch* targets, and the first version of this test asserted it at
   * desktop width with a mouse. It failed on three controls, which was correct, and it was
   * measuring the wrong thing: a mouse is precise and 44px buttons on a desktop rail are chunky
   * for no benefit. The rule is scoped to `pointer: coarse` in CSS, so the test has to be too, or
   * it is asserting something the design never claimed.
   */
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:31600");
  await waitForData(page);
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);

  /*
   * The list shipped at 31px a row and the filter buttons at 27px: not merely cramped, in breach of
   * the design system's own rule. Found by measuring after somebody said the list looked bad, which
   * is not a process that scales, which is why it is a test now.
   *
   * The slider is exempt: its hit area is the 18px track, and browsers already give range inputs a
   * generous invisible target that `getBoundingClientRect` does not report.
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

test("nothing is painted pure black", async ({ page }) => {
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
 * Left to eyes, deliberately.
 *
 * These are the section 13 rules a computer cannot judge, and listing them is more honest than
 * writing an assertion that pretends to cover them:
 *
 *   - whether the globe reads as an instrument rather than a placeholder at tweet size;
 *   - whether the wavefront reads as arriving rather than decorating;
 *   - whether the copy contains a claim the data does not support.
 *
 * The first two are checked by screenshot at each phase. The third is checked by reading.
 */
