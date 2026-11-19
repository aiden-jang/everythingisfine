import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../src/app/tonga/tonga.json", import.meta.url), "utf8"));
const origin = "https://everythingisfine.aidenjang.com";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const clock = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function pressurePages(shell) {
  const clean = shell
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<title>[^]*?<\/title>/, "")
    .replace(/<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^]*?>/g, "");
  return data.stations.flatMap((station) =>
    station.values.flatMap((raw, index) => {
      if (!/^[A-Z]+$/.test(station.id) || !Number.isFinite(raw)) return [];
      const minute = station.start + index;
      const path = `share/tonga/${station.id}/${minute}/index.html`;
      const title = `Tonga’s shockwave, recorded in ${station.name}.`;
      const description = `${((raw / 1000) * 33.8638866667).toFixed(2)} hPa at ${clock(minute)} UTC on 15 January 2022. One-minute station pressure from ASOS / Iowa Environmental Mesonet.`;
      const image = `${origin}/share/tonga-${station.id}.png`;
      const alt = `Tonga’s shockwave: ${station.name} station pressure trace, 15 January 2022. The selected reading is described in the link text.`;
      const metadata = `<title>${escape(title)} · meanwhile.</title>
<meta name="description" content="${escape(description)}" />
<meta name="robots" content="noindex, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="meanwhile." />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${origin}/${path.replace(/index.html$/, "")}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escape(alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image:alt" content="${escape(alt)}" />`;
      return [{ fileName: path, source: clean.replace("</head>", `${metadata}</head>`) }];
    }),
  );
}

export function tongaSharePages() {
  return {
    name: "tonga-share-pages",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const shell = bundle["index.html"];
        if (!shell || shell.type !== "asset" || typeof shell.source !== "string")
          throw new Error("Built index.html missing");
        for (const page of pressurePages(shell.source)) this.emitFile({ type: "asset", ...page });
      },
    },
  };
}
