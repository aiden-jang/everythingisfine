import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pressurePages } from "./tonga-share-pages.mjs";

const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("emits a bounded source-specific page for every archived reading", () => {
  const pages = pressurePages(shell);
  assert.equal(pages.length, 300);
  assert.equal(new Set(pages.map((page) => page.fileName)).size, 300);
  assert.ok(pages.every((page) => /^share\/tonga\/(PHNL|SFO|PANC)\/\d+\/index.html$/.test(page.fileName)));
  const honolulu = pages.find((page) => page.fileName === "share/tonga/PHNL/539/index.html").source;
  assert.match(honolulu, /<title>Tonga’s shockwave, recorded in Honolulu\. · meanwhile\.<\/title>/);
  assert.match(honolulu, /property="og:site_name" content="meanwhile\."/);
  assert.match(honolulu, /1017.75 hPa at 08:59 UTC/);
  assert.match(honolulu, /Tonga’s shockwave, recorded in Honolulu/);
  assert.match(honolulu, /\/share\/tonga-PHNL.png/);
  assert.equal((honolulu.match(/og:title/g) ?? []).length, 1);
  assert.equal((honolulu.match(/name="description"/g) ?? []).length, 1);
  assert.match(honolulu, /noindex, follow/);
  assert.match(honolulu, /script type="module" src="\/src\/main.tsx"/);
  assert.ok(!pages.some((page) => page.fileName.includes("/494/") || page.fileName.includes("/595/")));
});
