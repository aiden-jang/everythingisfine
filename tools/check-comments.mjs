/*
 * A ceiling on comments, run by `pnpm run verify`, because a cleanup pass is a moment and drift is
 * permanent.
 *
 * A share of the code rather than a line count. A count charges a new module for its own header, so
 * it blocks a genuine explanation exactly as hard as it blocks padding.
 *
 * The share here is high next to the other repos and that is deliberate. This app's non-obvious
 * decisions are numeric and physical: why the Gutenberg-Richter constant is dropped, why an
 * unobserved bucket is not an empty one, why 2000 is the carrier year for a date with no year. None
 * of that is recoverable from the code, and the comments were read before the number was set.
 *
 * What it catches is prose added to code that already exists, and the two shapes a density check
 * cannot see: the same comment in two places, and one that has drifted off its subject.
 */
import { globSync, readFileSync } from "node:fs";
import { report } from "./gate.mjs";

const CEILING = { src: 0.25, tools: 0.32, e2e: 0.28 };
/* Long enough that two files saying `// eslint-disable-next-line` are not called duplication. */
const DUP_MIN_CHARS = 45;

/*
 * Repeated on purpose: one line describing the same field or the same idiom in sibling modules, where
 * a reader in one of them should not have to find another file. Named rather than matched by shape,
 * because the two worst comments this check has found were also one line and also in two files: one
 * described the field above it instead of the field it sat on, and one explained a storage failure
 * while sitting on a font that failed to load.
 *
 * Everything else appearing twice is a comment copied along with the code under it, which stopped
 * describing one of the two the moment either changed.
 */
const REPEATED_ON_PURPOSE = [
  "Split, never grouped",
  "The agency that reported it",
  "Latitude it stands over",
  "The UTC day, which is the span the archive loads",
  "Paints the magnitude ramp outside the canvas",
  "Where the global catalogue stops depending on how many",
];

/** Comment spans in one file, with string literals blanked first. */
function comments(source, isCss) {
  /*
   * A path or glob holding `/*` would otherwise open a block comment that swallows the code after
   * it, and the count comes out high for a reason nobody can see. Masking is cheaper than parsing.
   */
  const masked = source.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (m) =>
    " ".repeat(m.length),
  );
  const re = isCss ? /\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  return [...masked.matchAll(re)].map((m) => ({
    text: source.slice(m.index, m.index + m[0].length),
    lines: m[0].split("\n").length,
    at: source.slice(0, m.index).split("\n").length,
  }));
}

// The gates' own source counts. A check that does not cover itself stops being checked.
const areas = {
  src: globSync("src/**/*.{ts,tsx,css}").filter((f) => !/\.(test|spec)\.tsx?$/.test(f)),
  tools: globSync("tools/*.mjs"),
  e2e: globSync("e2e/*.ts").filter((f) => !/\.spec\.ts$/.test(f)),
};

const seen = new Map();
const stranded = [];
const problems = [];

for (const [area, files] of Object.entries(areas)) {
  let total = 0;
  let count = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    total += source.split("\n").filter((l) => l.trim() !== "").length;

    for (const c of comments(source, file.endsWith(".css"))) {
      count += c.lines;
      const flat = c.text.replace(/\s+/g, " ").trim();
      // Directives are meant to repeat: two files suppressing the same rule is not duplication.
      if (flat.length < DUP_MIN_CHARS || /eslint-|@ts-|prettier-/.test(flat)) continue;
      seen.set(flat, [...(seen.get(flat) ?? []), `${file}:${c.at}`]);
    }

    /*
     * A comment, then a blank line, then a declaration. Prose that opens or closes a file is fine; a
     * paragraph floating above an export is a comment whose subject moved without it.
     */
    const lines = source.split("\n");
    let afterDeclaration = false;
    for (let i = 1; i < lines.length - 2; i++) {
      if (/^\}\)?;?$/.test(lines[i])) afterDeclaration = true;
      if (!afterDeclaration) continue;
      const isComment = /^\s*(\/\/|\*\/)/.test(lines[i]);
      const gap = lines[i + 1]?.trim() === "";
      const next = lines.slice(i + 2, i + 4).find((l) => l.trim()) ?? "";
      if (isComment && gap && /^(export |const |function )/.test(next.trim())) {
        stranded.push(
          `${file}:${i + 1} — "${lines[i].trim().slice(0, 56)}…" then a gap, then ${next.trim().slice(0, 36)}`,
        );
      }
    }
  }

  const allowed = Math.floor(total * CEILING[area]);
  if (count > allowed) {
    problems.push(
      `${area} is ${((count / total) * 100).toFixed(2)}% comments, over the ${(CEILING[area] * 100).toFixed(0)}% ceiling ` +
        `(${count} lines, ${allowed} allowed at ${total} lines).`,
    );
  }
  areas[area] = `${((count / total) * 100).toFixed(2)}%`;
}

for (const [text, where] of seen) {
  if (where.length < 2) continue;
  if (REPEATED_ON_PURPOSE.some((allowed) => text.includes(allowed))) continue;
  problems.push(`the same comment in ${where.length} places: ${where.join(", ")} — "${text.slice(0, 56)}…"`);
}
problems.push(...stranded.map((s) => `stranded: ${s}`));

report("comment", problems);
console.log(
  `comments ok: src ${areas.src}, tools ${areas.tools}, e2e ${areas.e2e}, no duplicates, none stranded`,
);
