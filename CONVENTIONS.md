# Working in Everything Is Fine

`AGENTS.md` and `CLAUDE.md` link here so repository guidance has one source.
Setup and commit conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).
The current system map is [SYSTEM.md](SYSTEM.md).

## Verification

Run `pnpm run verify` before reporting work complete. CI runs the same gates;
`tools/check-gates.mjs` rejects drift or a command that shadows a package-manager builtin.
Use `pnpm run <name>` for repository scripts.

Check that every scan examined the intended files. An empty or implausibly clean result can mean
a broken glob. New guards must cover their own implementation, reject a deliberately introduced
failure, and leave no temporary changes after the source is restored.
Do not loosen assertions, retries, timeouts, or ceilings to get a pass.

`pnpm run test:heap` enables garbage collection so the memory gate cannot quietly skip.
`pnpm run test:e2e` uses recorded feeds and an isolated server. One browser worker per CI runner
avoids software WebGL contention; sharding divides the suite across machines.
`pnpm run test:live` deliberately reaches public providers and remains outside the merge gate.

## Product constraints

Keep the globe keyless: a person cloning it must not need an account or secret.
Public feeds are reached directly from the browser. `worker/index.ts` serves the bounded
anonymous aggregate-events endpoint; it owns no feed proxy, account data or database.
Adding a data backend or paid provider changes the product boundary and needs an explicit decision.

USGS and EMSC may describe the same earthquake differently. Preserve both accounts and their
magnitude scales; do not average them into a number neither agency published. Association uses
the recorded time and distance policy in `src/data/reconcile.ts`.
An unanswered feed is a separate fact from an empty list.

Preferences use `src/app/useStored.ts` and save on change, never on mount. Pending archive
responses must not replace a newer request or a return to live. Camera changes must not recreate
the scene or source subscriptions. Preserve the reduced-motion path and synchronous still capture.

## Code and documentation

Keep cohesive pure rules outside components. Source and tool modules stay under the size and
state ceilings. Existing exceptions in `tools/check-size.mjs` must shrink when their files shrink;
do not grant the saved headroom back to another feature.

Comments explain hazards, compatibility constraints, or decisions that cannot be inferred from
the code. Avoid restating the implementation or recording refactor history. Re-read every comment
at a moved boundary. Never raise a comment budget to keep prose.

Long reasoning belongs in the indexed appendix in [ARCHITECTURE.md](ARCHITECTURE.md).
A code pointer must name the actual section, and moved modules need corresponding index entries.
The docs check reads wrapped pointers too. Current operating instructions live in
README, SYSTEM, CONTRIBUTING, and DEPLOY. Keep documentation about the maintained
system; remove superseded plans and use Git history for implementation diaries.

Do not put live test totals, file lengths, or gate totals in documentation. Let checks print them.
Historical measurements must identify the revision or conditions under which they were observed.

Keep generated review output out of Git; follow the [artifact policy](docs/quality.md#review-artifacts).
