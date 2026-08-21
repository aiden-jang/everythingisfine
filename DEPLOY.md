# Deploying Everything Is Fine

Merging to `main` deploys. Nothing else does, and nothing needs to be run by hand.

---

## What happens on a merge

`.github/workflows/ci.yml` has two jobs.

**`check`** runs on every push to `main` and on every pull request:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:heap
pnpm build
```

**`deploy`** runs only after `check` passes and only on `main`:

```
pnpm build
wrangler deploy        (via cloudflare/wrangler-action@v3)
```

A pull request therefore gets the full check and no deploy. A merge gets both, in that order. There
is no path that deploys without the tests having passed first, because `needs: check` is a hard
dependency rather than a convention.

### Three details that are deliberate

**`pnpm test:heap`, not `pnpm test`.** The four-hour memory test skips itself when `gc` is
unreachable, and a CI run that quietly skips its own memory gate is worse than one that never had
it. `test:heap` runs Node with `--expose-gc` so the gate cannot skip. If it is ever seen as
`skipped` in a CI log, that log is not enforcing what it appears to.

**`concurrency: deploy-everythingisfine` with `cancel-in-progress: false`.** Two merges landing close
together would otherwise race, and the loser could be the *newer* build. Queued rather than
cancelled, so the last merge is the last deploy.

**Browser tests are not in CI.** `pnpm test:e2e` and `pnpm test:live` both wait on two real
seismological agencies. A quiet planet, or an agency doing maintenance, would fail a build for
reasons that are not the code's fault, and a suite that cries wolf gets ignored. They are run
deliberately. Making them CI-able means routing both feeds to the committed fixtures, which is
listed as open work in ARCHITECTURE.md rather than pretended away.

---

## What has to exist first

**One repository secret: `CLOUDFLARE_API_TOKEN`**, with the `Workers Scripts:Edit` permission.

That is the whole list. No account id is configured anywhere, because Wrangler infers the account
from the token. No D1 permission is needed, because there is no database and no migration step.

Create the token at Cloudflare → My Profile → API Tokens, and add it under repository
Settings → Secrets and variables → Actions. **The token is never written into a file in this repo**,
and nothing in the build reads it except the deploy action.

The custom domain `everythingisfine.aidenjang.com` is declared in `wrangler.toml` as a route with
`custom_domain = true`. Wrangler creates and attaches it on the first deploy, provided the zone is in
the same Cloudflare account as the token. It does not need to be set up by hand beforehand.

---

## Why the deploy is this simple

`wrangler.toml` has **no `main`**. There is no Worker script, so there is nothing to bundle, nothing
to warm, and no runtime to configure. Cloudflare answers asset requests directly, which is why the
running cost is zero Worker invocations rather than a small number of them.

That is only possible because nothing needs a proxy. Both feeds are reached straight from the
browser: USGS returns `access-control-allow-origin: *`, and the EMSC WebSocket is exempt from CORS
by construction. A single keyed source anywhere in the design would have forced a Worker to hold the
secret, and taken the zero with it.

`workers_dev = false`, so the app is served only on its custom domain. A second guessable
`*.workers.dev` address would be a different origin for no benefit.

---

## Deploying by hand

```bash
pnpm deploy      # builds, then wrangler deploy
```

Needs `wrangler login` or `CLOUDFLARE_API_TOKEN` in the environment. Useful for a first deploy or a
rollback; not needed in the normal course of things.

---

## When something goes wrong

**The deploy job fails with an authentication error.** The token is missing, expired, or lacks
`Workers Scripts:Edit`. Rotate it in Cloudflare and update the repository secret; nothing in the
repo changes.

**The deploy succeeds and the site is stale.** Cloudflare serves the new assets immediately, so this
is almost always a browser cache. Assets are content-hashed (`dist/a/index-<hash>.js`), so a hard
reload settles it; `index.html` itself is the only unhashed file.

**The globe loads but stays empty.** That is a feed problem, not a deploy problem. Run
`pnpm test:live` to ask both agencies directly. The most consequential failure it checks for is USGS
dropping `access-control-allow-origin: *`, which would mean the app needs a proxy Worker and this
whole zero-invocation arrangement ends.

**A deploy needs undoing.** Cloudflare keeps previous Worker versions, so the fastest rollback is
the dashboard. Reverting the commit on `main` also works and takes one CI run.
