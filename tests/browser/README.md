# Private Sleeper browser tests

This local-only harness renders the actual `RosterApp`, components, analysis engine,
styles, clipboard helper, and Markdown/download code. It does not publish anything.
Only `fetch.functions` is replaced, using a Vite alias confined to this harness.
There are no production code changes, API keys, live transactions, or live roster fetches.

## Run

With project dependencies installed:

```sh
npx playwright install chromium
npm run test:browser
```

For a browser executable already installed in the environment:

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/absolute/path/to/browser npm run test:browser
```

`npm run test:preview` leaves the private preview running on loopback port 4174.
The automated runner starts its own ephemeral server and closes it after testing.
It uses Chromium; it does not claim Safari/Firefox coverage.
The initial Work validation used Chromium 134 headless shell via the executable
override because the newer browser archive could not be installed in that runtime.
Use the matching Playwright browser when available in other environments.

## Data and scope

`fixture.ts` builds a deterministic fictional three-team league through the real
analysis/Markdown pipeline. It includes healthy, Out, Questionable and bye-week
players. Add explicit fixtures here for new features; do not copy personal/live
league snapshots into the tests. `?refresh-fails` simulates a failed fetch.

The runner checks desktop/mobile rendering and loaded styles, uneven trades, tab preservation,
actual clipboard contents, actual downloaded Markdown, edit/clear/partner/team
resets, and successful/failed refresh. External browser requests are rejected in
the main test sessions. The baseline Markdown is compared byte-for-byte after resets.
Unit tests remain responsible for invalid proposals and analytical edge cases.

Results are written to ignored `test-results/browser/report.json`; screenshots go
to `/workspace/screenshots/sleeper-private-browser/` in this Work environment.
Run the full Sleeper suite separately before accepting an implementation.

This harness is not a deployed-site test: it does not exercise TanStack server
functions, production authentication, Grok hosting, or the real Sleeper API.
Those still require a final integration check when publishing a release.

## Optional projection experiment

The harness is outside the production tsconfig. Check its React/TypeScript import
graph separately with `npx tsc -p tests/browser/tsconfig.json --pretty false`.
This keeps strict TypeScript checks enabled; JavaScript checking remains off for
the experiment modules, whose public result shapes use JSDoc contracts. Both the preview import graph and full app typecheck now pass after resolving the
previous production diagnostics.
It does not replace runtime tests or the full production typecheck.

`?projection-study` opens a separate saved-live-data comparison screen after running
the collector/analyzer in `tests/projections/README.md`. The normal route remains
fictional. No production module imports this screen. Its local read-only endpoint
serves only the derived study JSON, not the raw capture or league response. The
private preview binds to loopback; do not publish it or copy raw study data into fixtures.

## Built server integration

`npm run build` followed by
`PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node tests/browser/production-smoke.mjs`
starts the real production preview and checks live SSR plus the TanStack POST refresh.
Port 8081 must be free. This makes read-only network requests to Sleeper; no fixtures
replace the server function. It records load duration, response bytes, runtime errors
and failed-resource hosts in ignored `test-results/browser/production-smoke.json`.
It does not publish or certify the eventual hosted environment.

The generic preview launcher probes the root with a two-second request timeout,
which is too short for this app's live-data SSR. The integration test waits for the
preview listener and allows each live page/refresh request up to 90 seconds.
