import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const data = JSON.parse(await readFile(new URL("../src/app/tonga/tonga.json", import.meta.url), "utf8"));
const font = (
  await readFile(
    new URL(
      "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
      import.meta.url,
    ),
  )
).toString("base64");
const directory = new URL("../public/share/", import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const station of data.stations) {
    const values = station.values.map((raw) => (raw / 1000) * 33.8638866667);
    const low = Math.floor(Math.min(...values)),
      high = Math.ceil(Math.max(...values));
    const path = values
      .map(
        (value, i) =>
          `${i ? "L" : "M"}${(i / (values.length - 1)) * 520} ${180 - ((value - low) / (high - low)) * 180}`,
      )
      .join(" ");
    const clock = (at) =>
      `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
    await page.setContent(`<!doctype html><html><style>
      @font-face{font-family:Geist;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#06161e;color:#e4edeb;font-family:Geist;width:1200px;height:630px;padding:58px 64px}header{font-size:15px;letter-spacing:.03em;color:#98b3b9}h1{font-size:66px;font-weight:500;letter-spacing:-.05em;line-height:1.06;max-width:500px;margin:100px 0 24px}p{font-size:19px;line-height:1.6;color:#98b3b9;max-width:430px}section{position:absolute;right:64px;top:155px;width:520px;background:#e4edeb;color:#102730;border-radius:5px;padding:30px}h2{font-size:30px;margin:0 0 30px;font-weight:500}svg{width:460px;height:180px;overflow:visible}footer{position:absolute;bottom:45px;font-size:14px;color:#98b3b9}.meta{font-size:12px;letter-spacing:.02em;margin-bottom:12px}.scale{display:flex;justify-content:space-between;font-size:12px;margin-top:12px;color:#405c65}
      </style><body><header>Everything is fine. / OBSERVATIONS</header><h1>One eruption.<br>A global echo.</h1><p>Tonga’s shockwave.<br>A pulse recorded across the Pacific.</p><section><div class="meta">15 JANUARY 2022 · ASOS ${station.id}</div><h2>${station.name}.</h2><svg viewBox="0 0 520 180"><path d="M0 0H520M0 90H520M0 180H520" stroke="#10273025" fill="none"/><path d="${path}" stroke="#32696d" stroke-width="2.5" fill="none"/></svg><div class="scale"><span>${clock(station.start)} UTC</span><span>${low}–${high} hPa</span><span>${clock(station.start + values.length - 1)} UTC</span></div></section><footer>Measured station pressure · ASOS / Iowa Environmental Mesonet</footer></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL(`tonga-${station.id}.png`, directory)) });
  }
} finally {
  await browser.close();
}
