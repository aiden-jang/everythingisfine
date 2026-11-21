const origin = "https://meanwhile.aidenjang.com";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function storyPreviewPage(shell, { path, title, description, image, alt }) {
  const canonical = origin + path;
  const clean = shell
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<title>[^]*?<\/title>/, "")
    .replace(/<link\s+rel="canonical"[^]*?>/g, "")
    .replace(/<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^]*?>/g, "");
  const metadata = `<title>${escape(title)} · meanwhile.</title>
<link rel="canonical" href="${escape(canonical)}" />
<meta name="description" content="${escape(description)}" />
<meta name="robots" content="noindex, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="meanwhile." />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${escape(canonical)}" />
<meta property="og:image" content="${escape(origin + image)}" />
<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escape(alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image:alt" content="${escape(alt)}" />`;
  return { fileName: `${path.slice(1)}index.html`, source: clean.replace("</head>", `${metadata}</head>`) };
}

export function storyPreviewPlugin(name, pages) {
  return {
    name,
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const shell = bundle["index.html"];
        if (!shell || shell.type !== "asset" || typeof shell.source !== "string")
          throw new Error("Built index.html missing");
        for (const page of pages(shell.source)) this.emitFile({ type: "asset", ...page });
      },
    },
  };
}
