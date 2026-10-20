// Validate documented paths, scripts, routes, symbols, and local links.
import { globSync, readFileSync } from "node:fs";
import { report } from "./gate.mjs";

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
  const notes = [...source.matchAll(/See\s+ARCHITECTURE\.md(#[\w-]*)?/g)];
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

/*
 * The docs that describe the app as it is now. `ARCHITECTURE.md` and `RECONCILIATION.md` are left out on
 * purpose: they are logs, and past tense is their job. Both name a file that was renamed because the old
 * name would have broken, a file in somebody else's repository, and a path inside a dependency. Asking a
 * record of what happened to resolve against what exists today is asking it to stop being a record.
 */
/* CLAUDE.md and AGENTS.md are symlinks to CONVENTIONS.md; listing them would report twice. */
const LIVE = [...globSync("*.md"), ...globSync(".github/**/*.md")].filter(
  (f) => !/^(ARCHITECTURE|RECONCILIATION|AGENTS|CLAUDE)\.md$/.test(f) && !f.endsWith(".local.md"),
);

const onDisk = globSync("{src,e2e,tools,worker,analytics,public,.github}/**/*", { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => `${d.parentPath}/${d.name}`)
  .concat(globSync("*.{json,ts,mjs,toml,html,md}"));

const scripts = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {}));
const code = [
  ...globSync("{src,e2e,tools,worker,analytics}/**/*.{ts,tsx,mjs}"),
  "package.json",
  "vite.config.ts",
]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const named = (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(code);

/* Named in a doc because they belong to somebody else, or because the doc is saying they are absent. */
const NOT_OURS = new Set(["devDependencies", "dataLayer", "npmjs"]);

for (const doc of LIVE) {
  let fenced = false;
  readFileSync(doc, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const at = `${doc}:${i + 1}`;
      if (line.trimStart().startsWith("```")) fenced = !fenced;

      for (const m of line.matchAll(/[\w./@-]*\w+\.(?:ts|tsx|css|mjs|toml|yml|html)\b/g)) {
        const bare = m[0].replace(/^`|`$/g, "");
        const tail = bare.split("/").pop();
        if (!onDisk.some((f) => f.endsWith(bare) || f.endsWith(`/${tail}`))) {
          problems.push(`${at}: no such file \`${bare}\``);
        }
      }

      /* Only inside backticks or a fence. Prose says "a pnpm command of the same name", which is not one. */
      /* Inside a fence a `#` starts a shell comment: "corepack enable  # makes pnpm available" is
         English about pnpm, not an invocation of a script called `available`. */
      const commands = fenced
        ? [line.replace(/#.*$/, "")]
        : [...line.matchAll(/`([^`]+)`/g)].map((b) => b[1]);
      for (const m of commands.join("\n").matchAll(/pnpm (?:run )?([a-z][\w:-]*)/g)) {
        const name = m[1];
        if (["install", "exec", "add", "dlx", "create", "run", "audit", "why", "outdated"].includes(name))
          continue;
        if (!scripts.has(name)) problems.push(`${at}: \`pnpm ${name}\` is not a script`);
      }

      // Bare, not just `name()`: a rename can sit in a sentence with no parentheses and no backticks.
      for (const m of line.matchAll(/(?<!\\)\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)) {
        if (!NOT_OURS.has(m[1]) && !named(m[1]))
          problems.push(`${at}: nothing named \`${m[1]}\` in the code`);
      }
    });
}

report("docs", problems);

console.log(
  `docs ok: ${LIVE.length} live docs resolve, and every note names a section of ${DOC} that exists`,
);
