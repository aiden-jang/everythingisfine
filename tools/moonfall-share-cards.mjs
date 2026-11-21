import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { lunarTraverses, valley } from "../src/sources/moonfall/traverses.ts";

const recordings = new URL("../src/sources/moonfall/recordings/", import.meta.url);
const directory = new URL("../public/share/", import.meta.url);
const [terrain, survey, display, sans] = await Promise.all([
  readFile(new URL("taurus-littrow.webp", recordings), "base64"),
  readFile(new URL("traverses.json", recordings), "utf8").then(JSON.parse),
  readFile(new URL("../src/assets/fonts/alumni-sans.ttf", import.meta.url), "base64"),
  readFile(
    new URL(
      "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
      import.meta.url,
    ),
    "base64",
  ),
]);
const width = (valley.right - valley.left) * 100;
const height = (valley.near - valley.far) * 100;
const position = ([x, z]) => [(x - valley.left) * 100, (z - valley.far) * 100];

await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [eva, traverse] of lunarTraverses.entries()) {
    const route = survey.tracks[eva]
      .map((leg) => leg.map((point, i) => `${i ? "L" : "M"}${position(point).join(" ")}`).join(" "))
      .join(" ");
    for (const [station, name] of traverse.stations.entries()) {
      const [x, y] = position(survey.stations[eva][station]);
      await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>
        @font-face{font-family:Alumni;src:url(data:font/ttf;base64,${display})}
        @font-face{font-family:Geist;src:url(data:font/woff2;base64,${sans})}
        *{box-sizing:border-box}
        body{width:1200px;height:630px;margin:0;background:#0a151c;color:#edf3f3;font-family:Geist,sans-serif}
        main{position:absolute;inset:0 725px 0 0;padding:50px 54px;display:flex;flex-direction:column;justify-content:center}
        header{position:absolute;top:50px;font-weight:600;font-size:24px;letter-spacing:-.04em}
        h1{margin:0;font:600 106px/.86 Alumni,sans-serif;letter-spacing:-.03em}
        p{margin:22px 0 0;font-size:22px;color:#b9ced0;line-height:1.35}
        footer{position:absolute;bottom:48px;color:#a7bec2;font-size:13px;line-height:1.5}
        svg{position:absolute;inset:0 0 0 auto;width:725px;height:630px;background:#17242b}
      </style><body>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <image href="data:image/webp;base64,${terrain}" width="${width}" height="${height}"/>
          <rect width="${width}" height="${height}" fill="#0a151c" opacity=".24"/>
          <path d="${route}" fill="none" stroke="#081219" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${route}" fill="none" stroke="#f3d39a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${x}" cy="${y}" r="19" fill="#0a151c" stroke="#eef5f5" stroke-width="4"/>
          <circle cx="${x}" cy="${y}" r="8" fill="#f3d39a"/>
        </svg>
        <main>
          <header>meanwhile.</header>
          <h1>${name}</h1>
          <p>Apollo 17 · Traverse ${eva + 1}<br>${traverse.day} 1972</p>
          <footer>Taurus–Littrow Valley<br>LRO / USGS imagery · Haase et al. traverse reconstruction</footer>
        </main>
      </body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: fileURLToPath(new URL(`moonfall-${eva + 1}-${station + 1}.jpg`, directory)),
        quality: 85,
      });
    }
  }
} finally {
  await browser.close();
}
