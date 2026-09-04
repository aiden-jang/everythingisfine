/*
 * The link between the code and the reasoning behind it, run by `pnpm run verify`.
 *
 * `ARCHITECTURE.md` carries the long form and the code carries a note pointing into it. Nothing read
 * either end, so both drifted: 247 notes said only "See ARCHITECTURE.md", which is a search through ten
 * thousand lines, and 45 of the index's 121 entries counted notes that had already been deleted.
 *
 * A pointer nobody checks is how a document nobody trusts gets written.
 */
import { globSync, readFileSync } from "node:fs";

const DOC = "ARCHITECTURE.md";
const doc = readFileSync(DOC, "utf8");

/* GitHub's rule: lowercase, drop everything but letters, digits, spaces and hyphens, spaces to hyphens. */
const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
const headings = new Set(
  doc
    .split("\n")
    .map((line) => /^#{1,6}\s+(.*?)\s*$/.exec(line))
    .filter(Boolean)
    .map((m) => slug(m[1])),
);

const indexed = new Set([...doc.matchAll(/^- \[([\w/.-]+)\]\(#([\w-]+)\)$/gm)].map((m) => m[1]));
const files = globSync("{src,e2e}/**/*.{ts,tsx}");
const problems = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const notes = [...source.matchAll(/See ARCHITECTURE\.md(#[\w-]*)?/g)];
  if (notes.length === 0) continue;

  for (const [, anchor] of notes) {
    if (!anchor) {
      problems.push(`${file}: a note says only "See ${DOC}". Name the section it means.`);
    } else if (!headings.has(anchor.slice(1))) {
      problems.push(`${file}: no heading in ${DOC} answers to \`${anchor}\``);
    }
  }
  if (!indexed.has(file)) problems.push(`${file} carries notes and the ${DOC} index does not list it`);
}

for (const listed of indexed) {
  if (!files.includes(listed)) problems.push(`${DOC} indexes \`${listed}\`, which does not exist`);
}

/* The counts this index used to carry went stale the first time a note was deleted. */
if (/^- \[[\w/.-]+\]\(#[\w-]+\) &mdash;/m.test(doc)) {
  problems.push(`${DOC}: the file index is carrying counts again. Nothing keeps them true.`);
}

if (problems.length > 0) {
  console.error("docs check failed:\n");
  for (const p of [...new Set(problems)]) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`docs ok: every note in the code names a section of ${DOC} that exists`);
