/*
 * Ceilings on file length and component state, run by `pnpm run verify`.
 *
 * Nothing else here notices a file growing, and a god-file is never added: it accretes twenty lines at
 * a time and no single diff looks wrong.
 *
 * 400 was picked from the shape of this codebase rather than imposed on it: the great majority of files
 * were already under it the day the gate went in. Lines are the proxy; the state count is the signal.
 */
import { globSync, readFileSync } from "node:fs";
import { report } from "./gate.mjs";

const MAX_LINES = 400;
const MAX_STATE = 12;

/*
 * Already over, and being decomposed. Listed at their own size rather than the ceiling being raised for
 * everyone, so nothing else can grow past it meanwhile.
 *
 * An entry sitting above its file fails too, so shrinking one is not something anybody has to remember.
 * Left to drift, the headroom a decomposition just won is free to grow back into.
 */
const ALREADY_OVER = {
  "src/App.tsx": { lines: 2337, state: 27 },
  "src/globe/Globe.tsx": { lines: 899 },
  "src/globe/scene.ts": { lines: 881 },
  "src/globe/controls.ts": { lines: 691 },
  "src/app/MagnitudeFilter.tsx": { lines: 602 },
  "src/geo/land.ts": { lines: 479 },
  "src/app/DetailPanel.tsx": { lines: 464 },
  "src/app/Timeline.tsx": { lines: 457 },
  "src/app/format.ts": { lines: 438 },
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

report("size", problems);

const decomposing = Object.keys(ALREADY_OVER).length;
console.log(
  `size ok: ceiling ${MAX_LINES} lines / ${MAX_STATE} state` +
    (decomposing > 0 ? `, with ${decomposing} file(s) still being decomposed` : ""),
);
