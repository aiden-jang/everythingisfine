/*
 * The share card, composed rather than screenshotted, and reproducible rather than a one-off.
 *
 * `index.html` has claimed since the preview shipped that the card was "captured from the app itself
 * by a Playwright script". That script was never committed, so the card could not be rebuilt after any
 * visual change to the globe, and the palette moved twice after it was taken. An asset nobody can
 * regenerate is an asset that quietly goes stale.
 *
 * It is a composition and not a crop, because the old card was an unlabelled dark circle. In a feed a
 * card is a thumbnail: whatever the client does with the title and description underneath, the image
 * itself has to say which app this is.
 *
 * **No earthquakes on it, deliberately.** A card is cached for days by every client that fetches it, so
 * real events would show one particular day's seismicity as if it were now. DESIGN.md section 10
 * forbids unlabelled sample data and a preview claiming yesterday's earthquakes are today's is exactly
 * that. So the globe is drawn with its geography and plate boundaries and nothing else, which is the
 * one version of this picture that cannot go out of date.
 *
 * Run it against a dev server:
 *
 *   pnpm dev            # in another shell
 *   pnpm card
 *
 * It writes `public/share.png` at the 1200x630 the meta tags promise.
 */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "share.png");
const BASE = process.env.CARD_BASE ?? "http://localhost:31600";

/*
 * A framing with land in three quadrants rather than a hemisphere of Pacific.
 *
 * `m=7.5` is the top of the magnitude scale, so nothing passes the filter and no marker is drawn. It
 * is the honest way to get an empty globe: the filter is a real control doing its real job, rather
 * than a flag that only exists to make this picture.
 */
const VIEW = "#at=105,18,1.05&m=7.5&r=thermal";

const card = (globe, tokens) => `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  @font-face {
    font-family: "Geist";
    src: local("Geist"), local("Inter"), local("Helvetica Neue");
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background: ${tokens.void};
    font-family: Geist, "Helvetica Neue", Arial, sans-serif;
    color: ${tokens.ink};
  }
  /* The globe bled off the right edge, so the card reads as a window onto it rather than a stamp. */
  .globe {
    position: absolute; top: 50%; right: -90px; transform: translateY(-50%);
    width: 760px; height: 760px;
    background-image: url("${globe}");
    background-size: contain; background-repeat: no-repeat; background-position: center;
  }
  /*
   * A wash left to right, so type on the left never sits on the coastlines.
   * Sized to the type rather than to the image: it has to stop before the globe's limb or the card
   * gets a vertical edge across it that reads as a seam.
   */
  .veil {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, ${tokens.void} 0%, ${tokens.void} 34%, transparent 62%);
  }
  .type { position: absolute; left: 72px; top: 50%; transform: translateY(-50%); width: 480px; }
  .mark { font-size: 26px; font-weight: 600; letter-spacing: 0.16em; }
  .rule { width: 44px; height: 1px; background: ${tokens.coast}; margin: 26px 0; }
  .line { font-size: 30px; line-height: 1.32; color: ${tokens.ink}; letter-spacing: -0.01em; }
  .feeds {
    position: absolute; left: 72px; bottom: 56px;
    font-size: 15px; letter-spacing: 0.1em; color: ${tokens.faint};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style></head><body>
  <div class="globe"></div>
  <div class="veil"></div>
  <div class="type">
    <div class="mark">EVERYTHING IS FINE</div>
    <div class="rule"></div>
    <!--
      One sentence, and not the same one as og:description. The description sits directly beneath the
      image in most clients, so repeating it here spends the card's only line saying a thing the
      viewer is already reading.
    -->
    <div class="line">Earthquakes, as they are reported, by two agencies that disagree.</div>
  </div>
  <div class="feeds">USGS &middot; EMSC</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  await page.goto(`${BASE}/${VIEW}`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 30_000 });
  /*
   * Long enough for the entrance to land and the plate boundaries to finish growing in. The entrance
   * is 2.8s and the boundaries reveal after it, and a card caught mid-reveal has half a tectonic map
   * on it.
   */
  await page.waitForTimeout(7000);

  // The palette, asked of the app rather than copied here, so the card cannot drift from it.
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const get = (n) => s.getPropertyValue(`--color-${n}`).trim();
    return { void: get("void"), ink: get("ink"), coast: get("coast"), faint: get("faint") };
  });

  const globe = await page.locator("canvas").screenshot();
  const shot = `data:image/png;base64,${globe.toString("base64")}`;

  const composer = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await composer.setContent(card(shot, tokens), { waitUntil: "load" });
  await composer.waitForTimeout(300);
  await writeFile(OUT, await composer.screenshot());
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
