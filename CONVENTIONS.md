# Working in everythingisfine

How this repo expects to be worked in. Personal working style (commits, planning,
how to explain things) lives in the global `~/.claude/CLAUDE.md`.

The first sections are engineering standards that apply to any codebase. The ones after them are about
this app in particular, and every claim in those was checked against the code before it was written down.

## Do not trust your own measurements

Most false statements come from scans that measured nothing, not from misreading code. Real cases:
a glob with `{src,test}` braces matched zero files, so a coverage sweep compared against an empty
string and called every module untested; a `cd` inside a backgrounded command did not apply, so
three "stability runs" ran nothing; a coverage tool reported 0% because it could not instrument the
runtime; a script name silently resolved to an npm builtin, so a check reported green for a day
without ever executing.

So: an impossibly clean result means suspect the scan first. And **green is not proof unless you
have seen that check fail**: break the thing it guards, watch it go red, then believe it.

## Writing a new check

- It has to cover its own source, or the checks stop being checked.
- It has to cover every place the failure can appear, not just where you first saw it.
- Exclude test files from source scans: tests mount throwaway routes and declare throwaway types.
- Prove it fails before trusting it, and prove a failure leaves the tree clean.
- Always `pnpm run <name>`, and never name a script after an npm command. A script called `docs` is
  shadowed by npm's own `docs`, which exits 0 without running anything.

## Numbers in prose

Do not write live counts into docs: test totals, check totals, file lengths. Nothing verifies them
and they go stale silently. Say what a thing is and let the check print the number. Describing a
past change is different, and fine.

## Comments

- Keep an inline comment to a line or two. A longer block has to earn it by recording something a
  reader would otherwise rediscover the hard way: a trap that has bitten, a constraint that fails
  silently, a reason not to try the obvious thing. Well over a hundred blocks here run longer than
  that and they are mostly the good ones, so length is not the test. "Why, not what" is. The
  cleanup that got the count down concluded the same thing and wrote it up in ARCHITECTURE.md.
- Never explain a refactor, or what the code used to do. A reader never saw that version.
- A comment that logs successive changes is a changelog. Git has it, and the log drifts out of step
  with the value it describes.
- After moving code, re-read every comment near the seam. A move strands them on the wrong function.
- Never raise a comment budget to fit prose. Trim instead; no script can enforce that about itself.

## The budget is the design

Zero. No key that costs money, and no key a person cloning this would have to go and get. Both feeds are
reached straight from the browser, `wrangler.toml` has no `main`, and the whole thing is static assets on
a custom domain. There is no Worker to invoke and so nothing to invoice.

Anything that needs a key, a backend, or a warm cache is not a small change here. It is a different app.

## Two agencies describing the same earthquake

USGS and EMSC both report, they disagree, and neither is wrong. `src/data/reconcile.ts` pairs a reading
from one with a reading from the other inside 30 seconds and 150km, and the store keeps both accounts
rather than averaging them into a number nobody published.

So: never normalise a magnitude, never drop a scale, and never let one feed's silence read as the event
not happening. `answered` is a fact of its own, separate from an empty list.

## What `pnpm run verify` runs

Gates, size, docs, typecheck, lint, format, the unit suite with `--expose-gc`, the build, then the browser
suite. CI runs the same list and `check-gates.mjs` fails if the two drift apart, so a step goes in both or
neither.

The other gates: `check-size.mjs` holds every file to 400 lines and 12 pieces of state, with a list of the
files already over. That list fails when an entry sits *above* its file too, so the headroom a
decomposition wins cannot be quietly grown back into. `check-docs.mjs` is below.

## The notes in the code point into ARCHITECTURE.md

The long reasoning lives in `ARCHITECTURE.md`; the code carries the warning and a note saying where the
rest is. Every note names a section: `See ARCHITECTURE.md#srcglobescenets.`, matching that file's own entry
in the appendix. `check-docs.mjs` fails on a bare `See ARCHITECTURE.md`, on an anchor no heading answers to,
and on a file that carries notes but is missing from the index.

That index carries no counts. It used to say how many notes each file had, and 45 of its 121 entries were
already wrong.

`ARCHITECTURE.md` and `RECONCILIATION.md` are logs, and past tense is their job. They are exempt from the
name checks the other docs get: both correctly name a file that was renamed, a file in somebody else's
repository, and a path inside a dependency.

## Preferences save on a change, never on mount

`src/app/useStored.ts` owns every remembered switch and measurement. An effect that writes unconditionally
fires on the first render and saves the default as though somebody had chosen it, which freezes every
existing viewer on whatever the default was the day they first opened the page. It was doing exactly that
for eleven preferences.

Add a preference with `useStoredFlag`, `useStoredNumber` or `useStoredName`. Do not hand-roll one.

## The kinds of test, and what each is for

`pnpm test` is the unit suite. `pnpm run test:heap` is the same suite with `--expose-gc`, which is the only
way the ring buffer's memory gate actually runs, and it is what CI uses.

`pnpm run test:e2e` is the browser suite, and it holds the claims only a browser can settle. It carries one
retry, for a lost WebGL context rather than for the app: two workers each hold one and a run occasionally
loses one mid-test. A logic failure fails twice.

`pnpm run test:live` reaches USGS, EMSC and EONET for real. It is excluded from every other run by
`EIF_LIVE`, and it answers a different question from the fixtures: not whether the parser works, but
whether the world still looks the way the fixtures say it does.

## Files that stay big for now

`App.tsx`, `Globe.tsx`, `scene.ts` and `controls.ts` are all far over the ceiling and listed as such.
`App.tsx` is the one worth chipping at: it still holds most of the app's state, and the way through is to
lift a cohesive cluster into a hook, ratchet its entry down, and leave the rest alone.

## How the code is commented

A comment here is a warning, not an essay. The bar is whether it records something that would cost
somebody real time to rediscover: a trap that has actually bitten, a deviation from the code around
it, a constraint that fails silently when broken, or why not the obvious alternative.

Everything else went, and in the last pass that became literal: every block that ran past a warning
into an explanation was cut back to its opening sentence plus its hazard, and the explanation moved to
[the appendix in ARCHITECTURE.md](ARCHITECTURE.md). The code keeps the sentence that stops somebody
undoing a decision and points at the appendix for why - findable by that same sentence.

What survives reads like a note over your shoulder - hazard first, imperative, one idea per sentence:

- *Never recover longitude with `atan2`. At a pole longitude does not exist, `atan2(0, 0)` is zero,
  and every meridian gets dragged onto the prime meridian.*
- *Evict by arrival order, never by origin time. With no backend the window really does start when
  the page loads, which is why the rail says "since 21:40".*
- *No backticks anywhere in this file's shaders. One ends the template literal, and the error lands
  twenty lines from the comment that caused it.*

Three passes: 13,190 lines, then about 7,600, now about 4,700. The last one fixed four faults - a
comment that had drifted away from the code it described, two or three piled above one line, a docstring
that restated the signature under it - and then moved 331 blocks of reasoning, about 2,100 lines, out to
the appendix. Nothing was deleted in that move; it is one file further away and in one place.
