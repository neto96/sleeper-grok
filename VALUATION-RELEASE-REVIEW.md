# Projection valuation release review

Review date: October 29, 2026 (America/Chicago).
Base checkout: bea0bc1dd5009d6453df3f2619cf3c5a8cba1aae.
Distribution: valuation-candidate branch; commit identity is recorded in Git history.

## Decision

GO for a reviewed personal-use release candidate with visible structural fallback.
NO claim of complete search-rank replacement or demonstrated predictive superiority.
This review originally preceded GitHub distribution. The candidate is now prepared
for the valuation-candidate branch; deployment remains a separate manual step.

## Implemented behavior

- Snapshot refresh retrieves live Sleeper weekly offensive forecasts with bounded
  concurrency, timeouts, schedule checks, league scoring, timestamps and coverage.
- Main trade results use complete-window projected starting-lineup changes when
  supported. Required follow-up drops are selected explicitly and included in both
  structural and projected analysis. Unusable projection evidence is labelled fallback.
- Main waiver comparison ranks the full eligible offensive pool by lineup improvement
  after an explicitly selected hypothetical drop, or using an open roster spot.
- Trade/waiver Markdown exports preserve choices, point changes, exclusions and unknowns.
- User-selected end week and move-effective week define the scenario. Started or
  uncertain game weeks are excluded using conservative earliest-game-day UTC cutoffs.
- Refresh, roster changes and window changes clear outdated comparisons and exports.
- Canonical Python remains untouched; snapshot JSON remains version 3.2 and excludes
  the new live projection payload.

## Evidence

- Fresh review run: 293 calculation/regression tests pass.
- Full app TypeScript check and dedicated browser-preview TypeScript check pass.
- Latest production build passed after the refresh fix.
- Latest browser validation: all 21 baseline checks passed, along with desktop/mobile
  main trade, drop, waiver, clipboard and failed-refresh scenarios. These are local
  Chromium harness checks, not a deployed-site test or Safari/Firefox certification.
- Live integrated retrieval previously loaded 12 teams and 728 offensive forecast
  identities. Its snapshot timestamp is 2026-10-29T19:26:17.806Z. The provider's
  `pre_game` status mismatch was found, fixed and regression-tested.
- This review evaluated 11 illustrative one-for-one trades against that saved snapshot,
  using Weeks 9–17. All 11 requests were valid. Of 22 team-side evaluations, 11 used
  projected valuation and 11 used structural fallback for incomplete full-window lineups.
  Selected roster: 4/11 projected; other rosters: 7/11 projected. This is a small smoke
  sample, not a representative estimate of every possible trade or a trade recommendation.
- Prior saved-live waiver checks found 253 comparable candidates for most tested drop
  choices, with 300 unknown. Some drops leave lineup holes and substantially less coverage.
- Performance optimization preserved full result equality across three 553-candidate
  scenarios; observed local times improved from 1.75–2.60 s to 0.12–1.46 s. Device and
  browser performance may differ.

## Practical limitations

This metric values projected offensive starting-lineup benefit, not market trade price,
dynasty value, confidence-calibrated outcomes, or complete league scoring. K/DEF and
four explicitly named rare categories are excluded. Structural tiers, depth context,
priority-need logic and the basic free-agent list still use the existing model.

Full-window completeness is deliberately strict: one unresolved active-player forecast
can suppress a comparison. No coverage threshold was relaxed to manufacture results.
An incomplete baseline lineup also cannot be scored as zero to inflate a pickup's gain.

Effective week is a user assumption, not automatic verification of Sleeper processing
or kickoff locks. End week is configurable, not an inferred championship certification.
Forecasts do not guarantee an injured player's future participation. Same-day UTC
exclusion is conservative and may omit still-playable games.

## Delivery boundary

Before publishing, preserve the exact reviewed source in a branch/patch and run a
hosting-environment integration check of live refresh, payload size/latency and exports.
The private browser harness does not exercise deployed authentication/server routing.
Forecast-accuracy evaluation remains a separate prospective study using frozen pregame
forecasts and matching final outcomes. These limitations must remain visible in handoff.

## Production packaging check — October 29

The Vercel-target production build passes. The built application loaded live Sleeper
data on desktop and mobile (HTTP 200), rendered the valuation controls, and had no
uncaught page errors or horizontal overflow. These checks use the real TanStack
server path, not the fixture harness.

The browser still reported failed external resources from Sleeper's image CDN,
Google Fonts, and Grok's branding script in this environment. Those failures must
be checked on the actual host; this is not a clean all-resources smoke result.
Live forecast availability varied between loads, so controls were not present on
every retrieval. The existing unavailable-data behavior remains necessary.

The generic preview launcher's two-second root readiness probe is shorter than
this app's live SSR request. One measured document load took 13.77 seconds and
returned 1,702,997 bytes. This is a single observation, not a latency guarantee.
The emitted Vercel function uses Node 24 and streaming; the October 29 candidate did not
specify a function maxDuration. Actual hosting settings remain unverified.

`scripts/package-valuation.py` produces a source patch plus SHA-256 manifest,
including new source/test files. It verifies the patch against a clean copy of
the exact base commit and compares every resulting file hash. It excludes raw
study captures, generated build output, dependencies, logs, and Python bytecode.
No public deployment or Grok handoff has occurred.

The real built-server refresh integration subsequently passed after the test
waited for React form hydration before clicking. The earlier click occurred
before interactive handlers were ready and did not verify a POST. The successful
run observed 12,746 ms / 1,702,999 bytes for initial HTML and 14,442 ms / 3,127,843
bytes for the refresh response. The refresh included the projection policy payload,
with no same-origin failed resources or uncaught page errors. Initial projection
controls were absent in that run; successful transport is not proof of full forecast
availability. External-resource failures remained. No hosted latency or size-limit
claim follows from these local measurements.

Next release gate: confirm the intended host and its effective request-duration and
response-size limits, then verify the same refresh and exports there. The package
is a reviewable candidate, not a claim that the valuation system is already live.

## Hosting timeout protection — October 30

Vercel documentation checked October 30:
https://vercel.com/docs/functions/limitations
https://vercel.com/docs/functions/configuring-functions/duration
The documented legacy Hobby default is 10 seconds, with 60 seconds configurable;
Fluid Compute has a longer default. The measured refresh exceeded the legacy
default. The documented body limit is 4.5 MB; our measured 3.13 MB response is
below that limit, but does not certify every league/window or hosting override.

The Nitro Vercel config now explicitly emits `maxDuration: 60` in
`functions/__server.func/.vc-config.json`, verified after a successful build.
The projection adapter now has a shared 20-second network retrieval budget across
all weekly batches, in addition to the 15-second per-request timeout. Expiry
cancels outstanding requests and returns unavailable projections with an explicit
reason, preserving structural fallback. Partial batches are never published.
A failed request also cancels its siblings. This budget covers forecast retrieval,
not the entire page request or synchronous calculation time.

295 calculation/regression tests pass, including expired-budget/no-network and
in-flight cancellation tests. Full TypeScript check passes. No valuation formula,
coverage threshold, user-selected window, or export version changed.
Actual host configuration and deployed behavior are still not verified.

Post-change built-server integration passed: live initial document 14,560 ms /
1,704,199 bytes; hydrated POST refresh 12,546 ms / 3,129,253 bytes. No uncaught
page errors or failed same-origin resources. External image/font/branding requests
still failed in the test environment. These timings are individual observations,
not evidence that the timeout change improves speed.

## Existing public host inspection — October 30

User-confirmed URL: https://velvet-shadow-craft-heart.grok.me/
A read-only HTTP request returned 200 in 4.33 seconds with 846,235 HTML bytes.
The response carried `x-vercel-id` and `x-vercel-cache: MISS`, confirming Vercel
in the serving path. The live page identifies itself as v3.5.1, has the Trade tab,
and lacks projection-window controls and the `core-offense-v1` payload marker.
The visible version label does not establish an exact source commit.

The live browser rendered the league and completed Refresh (disabled/refreshing
state returned to enabled). The browser reported React error 418, a hydration
mismatch. The HTTP-rendered timestamp was 11:29 AM while the browser displayed
6:30 AM, consistent with the source's environment-dependent date formatting.
React documentation explicitly lists differing locale date formatting as a cause:
https://react.dev/errors/418

The candidate now formats the Updated timestamp using explicit en-US locale, UTC
timezone and a visible UTC suffix. Its built-server integration test now uses an
es-MX browser locale and America/Chicago timezone to differ from the server.
No scoring or valuation logic changed. TypeScript, build and 295 tests pass.

The public URL cannot disclose the project's effective maxDuration, Fluid Compute
setting, deployment credentials or source-to-publish mechanism. The new candidate
remains unpublished; these host observations describe the existing older version.

Cross-timezone built-server integration passed with no page errors: initial HTML
20,631 ms / 1,703,972 bytes; live POST refresh 15,814 ms / 3,129,022 bytes. The
external CDN/font/branding failures remained environment limitations. This verifies
the candidate locally; the existing public site has not received this fix.
