/*
 * Ceilings on file length and component state, run by `pnpm run verify`.
 *
 * Nothing else here notices a file growing, and a god-file is never added: it accretes twenty lines at
 * a time, no single diff looks wrong, and one component ends up holding forty-five of the fifty-two
 * pieces of state in the whole app.
 *
 * 400 is not arbitrary. Nine files in ten are already under it, so the ceiling sits above the shape of
 * this codebase rather than cutting through the middle of it. Lines are the proxy; the state count is
 * the signal. Splitting the file is almost always the right answer to a failure.
 */
import { globSync, readFileSync } from "node:fs";

const MAX_LINES = 400;
const MAX_STATE = 12;

/*
 * Already over, and being decomposed. Listed at the size they were on the day the gate went in rather
 * than the ceiling being raised for everyone, so nothing else can grow past 400 meanwhile.
 *
 * An entry that sits above its file is a failure too, so shrinking one is not something anybody has to
 * remember. Left to drift, the headroom a decomposition just won is quietly available to grow back
 * into, which is how the file got here.
 */
const ALREADY_OVER = {
  "src/App.tsx": { lines: 2404, state: 33 },
  "src/globe/Globe.tsx": { lines: 900 },
  "src/globe/scene.ts": { lines: 881 },
  "src/globe/controls.ts": { lines: 691 },
  "src/app/MagnitudeFilter.tsx": { lines: 603 },
  "src/geo/land.ts": { lines: 479 },
  "src/app/DetailPanel.tsx": { lines: 471 },
  "src/app/Timeline.tsx": { lines: 457 },
  "src/app/format.ts": { lines: 441 },
};

/*
 * Tests are left out. They declare fixtures and mount throwaway components, so length there says
 * something different. `e2e/interaction.spec.ts` is the long one and splitting it costs a browser
 * context per file.
 */
const files = globSync("{src,tools}/**/*.{ts,tsx,mjs}").filter((f) => !/\.(test|spec)\.tsx?$/.test(f));
const problems = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  // Counted the way `wc -l` counts, so the number here is the number a person reads off the file.
  const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  // useState in a component, not every hook: a count of these is how much one file keeps track of.
  const state = (source.match(/\buseState[(<]/g) ?? []).length;
  const allowed = ALREADY_OVER[file] ?? {};
  const lineCap = allowed.lines ?? MAX_LINES;
  const stateCap = allowed.state ?? MAX_STATE;

  if (lines > lineCap) problems.push(`${file} is ${lines} lines, over ${lineCap}`);
  if (state > stateCap) problems.push(`${file} holds ${state} pieces of state, over ${stateCap}`);

  if (!ALREADY_OVER[file]) continue;
  if (lines <= MAX_LINES && state <= MAX_STATE) {
    problems.push(`${file} is under the ceiling now: drop it from ALREADY_OVER`);
  } else {
    if (allowed.lines !== undefined && lines < allowed.lines) {
      problems.push(`${file} is down to ${lines} lines: lower its ALREADY_OVER entry from ${allowed.lines}`);
    }
    if (allowed.state !== undefined && state < allowed.state) {
      problems.push(`${file} is down to ${state} state: lower its ALREADY_OVER entry from ${allowed.state}`);
    }
  }
}

for (const file of Object.keys(ALREADY_OVER)) {
  if (!files.includes(file)) problems.push(`${file} is listed as being decomposed but does not exist`);
}

if (problems.length > 0) {
  console.error("size check failed:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

const decomposing = Object.keys(ALREADY_OVER).length;
console.log(
  `size ok: ceiling ${MAX_LINES} lines / ${MAX_STATE} state` +
    (decomposing > 0 ? `, with ${decomposing} file(s) still being decomposed` : ""),
);
