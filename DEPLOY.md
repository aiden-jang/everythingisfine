# Deployment

Pushing to `main` starts the existing Cloudflare deployment after the quality checks and every
browser shard pass. Pull requests run the same checks without deploying.

## Workflow

`.github/workflows/ci.yml` runs the repository checks and browser suite in parallel.
`pnpm run verify` runs the same checks locally, in sequence. It includes the dependency audit,
documentation and architecture pointers, file and state budgets, comments, CSS variables,
unused code, types, lint, formatting, unit tests with garbage collection, the production build,
emitted CSS classes, and browser journeys.

The browser matrix distributes tests across isolated runners, each using one Chromium worker.
Ordinary journeys load the production build. The tagged camera and store probes use a separate
development origin, so internal instrumentation never becomes part of the release bundle.
Every shard must succeed before deployment can start; a failed, skipped or cancelled shard blocks
release. Test results include durations; failure artifacts include screenshots and traces.

Deployment depends directly on `check` and the complete `e2e` matrix. It downloads the production assets built
by `check`, then deploys them through Wrangler. The artifact belongs to the same workflow run,
so deployment publishes the bundle that passed the build and CSS checks.

Superseded pull request runs are cancelled. Main runs are queued, and deployment has its own
concurrency group so two successful merges do not publish out of order.

## Hosting and credentials

`wrangler.toml` configures static assets and the small anonymous analytics Worker. It has no
database or migration step. Feed requests go directly from the browser to public providers.

The repository secret `CLOUDFLARE_API_TOKEN` needs Workers Scripts:Edit for this deployment.
Wrangler infers the account from the token. Keep the token in GitHub secrets; never put it in
source, a pull request, or a log.

## Troubleshooting

Start with the failed job in [GitHub Actions](https://github.com/aiden-jang/everythingisfine/actions).
A red quality check or browser shard blocks deployment. Download the browser-results artifact
for the failing shard and open its trace locally:

```bash
pnpm exec playwright show-trace /absolute/path/to/trace.zip
```

Reproduce browser failures with `pnpm run test:e2e`. The run owns its local server and refuses
to reuse a manual server on ports 31600 and 31601. Agency availability cannot affect these tests because
`e2e/feeds.ts` supplies recorded responses.

The separate Feeds workflow deliberately checks public endpoints. Its failures describe
provider availability or contract drift, and do not block the fixture-backed CI suite.

For an intentional rollback, revert the affected commit on main and let the
same checks and automatic deployment run. Manual `pnpm run deploy` is available for maintenance;
normal releases require no local deployment command.
