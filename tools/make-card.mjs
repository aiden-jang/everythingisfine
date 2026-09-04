/*
 * The share card, composed rather than screenshotted. Run it against a dev server:
 *
 *   pnpm dev            # in another shell
 *   pnpm card
 *
 * It writes `public/share.png` at the 1200x630 the meta tags promise.
 *
 * No live data on it. A card is cached for days by every client that fetches it, so real events would show
 * one afternoon's seismicity as if it were now.
 */
// `@playwright/test`, not `playwright`: the bare package is not a dependency here, so the import this
// script shipped with threw ERR_MODULE_NOT_FOUND and `pnpm card` had never actually run.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "share.png");
const BASE = process.env.CARD_BASE ?? "http://localhost:31600";

/*
 * A framing with land in three quadrants rather than a hemisphere of Pacific. `m=7.5` is the top of the
 * magnitude scale, so nothing passes the filter: an empty globe from a real control doing its real job,
 * rather than a flag that exists only to make this picture.
 */
const VIEW = "#at=105,18,1.05&m=7.5&r=thermal";

/*
 * Block every feed, rather than filtering.
 *
 * `m=7.5` empties the globe of earthquake markers and nothing else. The five hazard layers ignore the
 * magnitude filter - correctly, a fire has no magnitude - and so do the wavefront rings: the first card built
 * after those layers had three orange rings on it at `m=7.5`.
 *
 * Blocked at the network, not behind a new switch, so the app is unmodified. `m=7.5` is the second lock.
 */
const FEEDS = ["earthquake.usgs.gov", "www.seismicportal.eu", "www.gdacs.org", "services.swpc.noaa.gov"];

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
  // A wash left to right, so type on the left never sits on the coastlines. Sized to the type rather than to
  // the image: it has to stop before the globe's limb or the card gets a vertical seam across it.
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
    <div class="line">Earthquakes, storms, volcanoes, fires and floods, as they are reported.</div>
  </div>
  <div class="feeds">USGS &middot; EMSC &middot; GDACS &middot; NOAA</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (FEEDS.some((host) => url.includes(host))) return route.abort();
    return route.continue();
  });
  // EMSC arrives over a WebSocket, which `route` does not see. Without this a single live arrival in
  // the wait below puts a wavefront ring on a card that will be cached for days.
  await page.routeWebSocket("**/*", (ws) => ws.close());
  await page.goto(`${BASE}/${VIEW}`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 30_000 });
  /*
   * Long enough for the plate boundaries to finish growing in, and coupled to the feeds being blocked. With
   * no feed answering there is no entrance replay, so the reveal starts on its 8s fallback in `Globe.tsx` and
   * then takes 1.5s. Seven seconds was right while the earthquake feeds still loaded.
   */
  await page.waitForTimeout(11_000);

  /*
   * The key hints, hidden for the shot. `locator.screenshot()` clips the page to the element's box rather
   * than isolating the element, so the hint row landed across the bottom of the globe. Hidden here rather
   * than in the app, because it is right on screen and wrong only in a photograph of it.
   */
  await page.addStyleTag({ content: ".key-hints { display: none !important; }" });

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
