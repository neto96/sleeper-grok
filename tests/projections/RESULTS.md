# Private experiment status — October 29, 2026

Decision: suitable for private supplementary review; predictive superiority over
search rank remains unproven. Production valuation is not changed by this experiment.

## Consolidated release assessment

See `VALUATION-RELEASE-REVIEW.md` for the current decision and boundaries. Fresh review:
293 tests and both TypeScript checks pass. Eleven illustrative trades on the saved
October 29 snapshot yield 11 projected and 11 structural-fallback team-side evaluations.
This supports a personal-use candidate with visible fallback, not a claim that search
rank has been eliminated or predictive accuracy improved. No publishing action taken.

## Release review: clean types and refresh consistency

Resolved all 17 previously carried TypeScript diagnostics without changing the scoring
rules: availability inputs now express fields that can be absent (already handled as
unknown at runtime), dynamic analysis records have their declared record type, loader
hooks have Node's hook signature, and tests validate optional fields/use complete
snapshot fixtures instead of an invalid cast. Both app and preview typechecks pass.

Refresh now remounts the waiver scenario alongside trade analysis and disables waiver
selection while pending. Failed refresh cannot retain a previous hypothetical drop or
reintroduce its Markdown comparison. Desktop/mobile regression checks verify the actual
clipboard no longer contains that comparison after a simulated refresh failure.

293 calculation/regression tests pass; production build succeeds. No commit, push or
deployment. This is an integrated local implementation, not an accuracy-validation
claim or a published release. Final consolidated review/handoff remains separate from
permission to publish.

## Explicit move-effective week

Added a Moves effective from selector for trade/waiver scenarios. Only weeks at or
beyond that selection and still before the conservative game-day cutoff contribute.
Changing it clears analyzed comparisons/exports; valid same-league/season refreshes
retain it. Shortening the end week below the selected effective week resets the start
to the loaded current week. This is user-provided transaction timing, not an inferred
Sleeper processing schedule or automatic execution.

293 tests pass; production build succeeds; 17 pre-existing type diagnostics remain.
Desktop/mobile checks verify selection reset, narrowed comparison range, and start/end
consistency. No deployment, commit or push. Remaining work is a consolidated release
review, including typecheck debt and refresh/export consistency across the new controls.

## Full-pool waiver performance

Benchmarked three hypothetical drops against the saved fresh live snapshot at one fixed
comparison timestamp, 553 candidates each. Baseline calculations took 1746/1946/2604 ms;
optimized calculations took 121/675/1462 ms in the observed local run. Every complete
result object (rank order, point values, unknowns and metadata) matched by deep equality.
These single-run timings are environment-dependent, not a device-performance guarantee.

The unchanged baseline roster is now solved once per week. Candidates with missing
forecast evidence skip optimization, and an unfillable resulting week stops that
candidate's calculation early. Ranking and conservative coverage policies are unchanged.
292 regression tests pass; production build succeeds; no new waiver type diagnostics.
No UI layout change in this pass; no new browser render check. No commit/push/deployment.
Exact transaction-effective timing and remaining release checks are still outstanding.

## Fresh live-league integration review

A fresh integrated snapshot load for league 1389736505374691328 completed in 18.9
seconds: 2026 Week 8, 12 teams, 728 offensive forecast identities. This exposed a
real provider-contract mismatch: upcoming schedule rows use `pre_game`, previously
rejected by the conservative timing validator. Added that recognized status and a
regression test, then refreshed the schedule and re-evaluated the saved fresh snapshot.

Usable future comparison weeks are 9–18. For selected roster 3 (15 active players),
the full currently usable offensive waiver pool contains 553 candidates. Across 13
possible offensive drops, most choices yield 253 fully comparable candidates and
300 unknown; two choices yield 3/550 and 38/515 because lineup completeness differs.
These are coverage results, not recommendations to drop those players or evidence of
forecast accuracy. No roster transaction was made. The fresh snapshot remains ignored
local test data, not a durable remote backup.

292 tests pass and the production build succeeds after the fix. No deployment,
commit or push. Exact transaction-effective timing, performance review with the full
pool, and remaining release validation still require attention.

## Explicit end-week configuration

The app now offers a valuation end-week selector using only loaded weeks. It derives
trimmed projections from an intact source, recomputes player subtotals and coverage,
and clears trade/waiver comparisons on change. Expanding the window restores loaded
weeks without refetching. The selection is retained on refresh for the same league
and season when still valid; it is session state, not a change to Sleeper settings.
Championship verification is not inferred from selecting a cutoff.

291 tests pass; production build succeeds; full typecheck retains 17 existing errors.
Remaining release review includes exact transaction-effective timing and fresh live-
league end-to-end coverage. No commit, push or deployment.

## Conservative game timing

Live projection payloads now carry per-week earliest game-day cutoffs from the schedule.
Trade and waiver valuation exclude whole weeks whose cutoff has passed, or whose timing
is missing/invalid. Date-only game dates use midnight UTC, deliberately conservative;
this is not exact kickoff enforcement or a claim about Sleeper trade-processing rules.
Completed/in-progress statuses cannot authorize projected future gains. Old projection
payloads without cutoff metadata cannot drive valuation until refreshed.

Trade reasons show the retained comparison range; waiver screen/Markdown disclose that
same-day/unknown timing is excluded. Existing structural analysis remains available.
Validation: 288 tests passed before the additional main-verdict timing regression;
11 targeted timing/trade tests passed after that addition. Typecheck adds no diagnostics
in changed valuation/adapter modules. Exact transaction-effective timing, explicit
championship configuration and fresh end-to-end league review remain release work.
No commit, push or deployment.

## Waiver Markdown export integration

Ready hypothetical waiver comparisons now append to copied/saved Markdown and the
Markdown tab, preserving the on-screen drop, top twelve rows, exact point gains,
unknown rows/counts, availability caveats, window and scoring exclusions. A snapshot
identity check prevents stale comparisons from another refresh or selected roster.
Unresolved comparisons are omitted. JSON version 3.2 remains unchanged.

Validation: 286 tests pass; production build succeeds; full typecheck reports the
existing 17 diagnostics and none in the changed components or export helper. Names
are escaped and stale/unresolved exports have dedicated regression coverage.
No commit, push or deployment. Timing/game locks, championship configuration and final
fresh live-league review remain outstanding before release.

## Main-screen projected waiver ranking

The main waiver screen now ranks available offensive candidates by projected starting-
lineup gain over the complete configured window. Full rosters require a user-selected
hypothetical offensive drop; open slots require none. Over-capacity rosters block the
comparison. Rostered, unavailable and unsupported-position candidates are excluded.
The full analysis waiver pool is used, without truncating to the search-rank top 30.

Negative changes remain negative and incomplete forecasts remain unknown; known rows
sort by point gain, with deterministic name/ID ties. Freshness, season, window, scoring,
duplicate identity and lineup checks fail closed. Switching teams or snapshots resets
the hypothetical drop. Existing recommendations are labelled structural context.
The hypothetical waiver comparison does not yet feed the saved snapshot export, which
is disclosed on screen; this integration is still outstanding.

Validation: 284 unit/regression tests pass, production build succeeds, and full typecheck
retains the existing 17 diagnostics. The dedicated preview check adds no preview errors.
Desktop/mobile waiver checks pass for required drop, gains, unknown data, roster reset
and recalculation; screenshots visually inspected without horizontal overflow or page
errors. Browser executable restored after environment resume. No commit/push/deployment.

Remaining release work includes waiver export consistency, game-lock/effective-date
handling, championship window configuration and fresh end-to-end league coverage review.
This does not establish predictive accuracy or complete replacement of structural tiers.

## Main-screen follow-up drops

The main trade screen now offers required follow-up drops from each resulting active
roster, with selection limits, undo, and resets on trade/partner/team/snapshot changes.
Each selection reruns structural and projected analysis on the resolved roster. The
result and Markdown identify selected drops and remaining capacity requirements; no
Sleeper transaction is made. Invalid, duplicate, outgoing, reserve, or excess drops
are rejected by the analysis layer, not just prevented by the UI.

K/DEF follow-up drops explicitly retain structural fallback because the offensive
objective cannot value their loss. The separate private projected-trade helper accepts
the same request drop fields while keeping its structural baseline free of duplicate
application. Existing snapshot behavior and canonical Python remain unchanged.

Validation: 279 unit/regression tests pass; main desktop/mobile browser scenarios cover
selection, limits, undo and clear, with screenshots visually inspected. All 21 existing
browser checks pass. Production build succeeds; the full typecheck retains the same
17 existing diagnostics. No commit, push or deployment. Next integration is projected
waiver ranking; game-lock/effective-date and championship configuration remain release
review items, and predictive accuracy has not been established.

## Main trade valuation continuation

`analyzeTrade` now applies projected offensive lineup change to the main verdict when
both before/after lineups are complete for every week in the snapshot projection window.
The mean change determines Improvement/Worse/Mostly lateral (rounded to hundredths),
with incoming availability uncertainty retaining Risky for nonnegative outcomes. This
is roster benefit, not a package-market-price or empirically calibrated confidence score.

Stale captures/rows, window or scoring mismatch, incomplete forecasts, unresolved drops,
and K/DEF/reserve trades explicitly retain labelled structural fallback. Historical
snapshots without projections retain their existing behavior. The screen and trade
Markdown share the result and its basis; structural depth details still use rank data.
The separate projected-trade drop evaluator explicitly obtains a structural-only base.

Validation: 277 tests passed; 12 targeted trade/Markdown tests passed after final wording
and base-analysis adjustments. New main-app browser scenarios passed at 1280/390 widths,
with visible point changes, valuation basis and clear/reset; screenshots inspected.
All 21 existing browser scenarios passed. Main typecheck retains 17 existing diagnostics;
a preview helper type incompatibility was found and corrected. Production build passed.
No commit, push, deployment, canonical Python or snapshot-version change.

Remaining integration: primary-screen follow-up-drop selection, waiver valuation/ranking,
and complete release review (including timing of trade effectiveness versus game locks,
championship configuration and fallback coverage in live league data). These are not
claimed complete by this checkpoint. Forecast accuracy remains unproven.

## Live adapter continuation

Snapshot refresh now loads bounded weekly offensive forecasts for the matching current
NFL regular season, through NFL Week 18 (not a claimed fantasy championship). It reuses
the schedule already fetched by the snapshot loader and league scoring settings. Three
requests at a time, 15-second request timeouts; no polling or scheduled collection.

Shared typed scoring and schedule validation now live under app source; the private
studies re-export these implementations. Unknown scoring, invalid schedules, malformed
response identities, or transport failure produce an unavailable projection payload.
Individual stale, missing, duplicate or conflicting forecasts remain unknown. All four
rare scoring exclusions remain explicit. Projection data is omitted from the existing
version-3.2 JSON download; the snapshot version and canonical Python repo are unchanged.

Validation: 274 tests passed, production build succeeded, and the full typecheck retained
exactly the same 17 diagnostic lines with no new diagnostics. Snapshot integration is
covered with mocked requests, including the export boundary. A one-week live provider
check returned a valid response for 153 saved roster identities, with 128 covered Week-8
forecasts and the four expected exclusions. This used saved league/schedule/roster inputs;
it was not a fresh end-to-end live snapshot or an accuracy evaluation. The remaining
players include byes and missing/invalid forecasts; do not interpret 128 as full coverage.

Main trade/waiver UI and decision routing remain outstanding. No commit, push or deployment.
Generated build output was restored/removed after validation, preserving source changes.

## Integration continuation

The requested completion target is now an integrated valuation system before the
Grok handoff, rather than a supplementary prototype. First source integration:

- Typed shared projection optimizer moved into app source and used by the private
  trade preview through a compatibility re-export; no duplicated algorithm.
- Added roster-specific points above replacement, with bench coverage and an explicit
  supplied available-player pool. Unknown replacement forecasts suppress the value;
  no complete alternative means unknown, not zero. Negative values remain visible.
- Added projected trade analysis using the existing simulator and trade validation,
  with distinct active-player drop validation and required-drop blocking.
- 268 unit/regression tests pass. Desktop/mobile trade browser checks passed against
  the shared optimizer. Full typecheck has the same 17 diagnostics as before, no new
  diagnostics. No deployment or production build in this integration pass.
- Live provider adapter, primary UI/waiver/verdict integration, and final release
  checks remain outstanding. No claim of predictive superiority or completed rollout.

The earlier checkpoint below describes the pre-integration state.

## Current checkpoint

- Saved October 28 capture: 153 offensive players, 1,412 covered player-weeks,
  109 confirmed byes, nine unresolved player-weeks. No fresh provider fetch in this pass.
- Player comparison and trade-lineup screens use saved live data. Trade results show
  weekly assignments and separate transfer/drop effects; unresolved required drops
  block comparison. Missing forecasts are not zero.
- Core-offense scoring excludes four rare categories and K/DEF. Week 17 is an
  explicit study cutoff, not a verified championship endpoint.
- Fresh validation: 259 unit/regression tests passed; player-comparison and trade
  browser scenarios passed at desktop and mobile widths, including stale/missing
  capture states, uneven trades, drop limits/undo, and selection resets.
- Desktop/mobile trade screenshots visually inspected; no horizontal overflow or
  uncaught page errors in the tested scenarios. Chromium 134 executable restored.
- Dedicated preview typecheck has zero diagnostics in preview files and eight
  existing diagnostics in imported production modules; the check still exits nonzero.
  Production build and full app typecheck were not rerun in this documentation/QA pass.
- No commit, push, deployment, or production code edits in this pass. Existing
  uncommitted work preserved. Local forecast archive is not a durable remote backup.

Next decision evidence: confirm championship configuration, review scoring exclusions
and roster-fit interpretation, then compare frozen pregame forecasts against final
outcomes using identical scoring. Do not treat passing software tests as evidence of
forecast accuracy. No future collection has been scheduled.

## Historical results — October 28, 2026

The following records earlier stages; the checkpoint above supersedes their status
and remaining-work statements.

Decision: promising as supplementary projected-production evidence; not approved as
a replacement for trade verdicts or as a validated accuracy improvement.

Read-only capture finished 2026-10-28T18:27:58.885Z. Evaluated NLFL league
1389736505374691328, 2026 Weeks 8–17 (explicit study window), with its actual
scoring settings. Used current Sleeper projection records and current search ranks.
The existing engine's exported `fantasyValueTier` supplied baseline tier labels.

## Observed coverage

- 153 rostered QB/RB/WR/TE players; all had at least one usable projected week.
- 1,412 covered and 118 missing player-weeks out of 1,530.
- No schedule was supplied: missing weeks are unknown, not automatically byes or zero.
- Four enabled scoring categories remain outside the experimental calculation:
  `fum_rec_td`, `st_ff`, `st_fum_rec`, `st_td`.
- Consequently zero outputs were certified as complete remaining-season league totals.
  Displayed values are supported-stat subtotals, preserving missingness and scoring gaps.

## Illustrative comparisons

Positive differences favor the first player. Comparisons use only identical weeks
covered for both players and supported league scoring; not actual results or trade advice.

| Pair | Existing tiers | Common weeks | Mean projected difference |
| --- | --- | ---: | ---: |
| Puka Nacua / A.J. Brown | elite / elite | 9 | +7.63 |
| Michael Wilson / Rome Odunze | strong / strong | 8 | +2.59 |
| Michael Wilson / Xavier Worthy | strong / useful | 9 | +3.30 |

Among 651 same-position/same-tier pairs without current injury flags and with at least
six common covered weeks, 545 differed by at least one projected point per game.
These overlapping pairs are descriptive, not independent statistical trials.

The data also deserves skepticism: Marvin Harrison Jr.'s forecast averaged only about
1.52 supported points over nine covered weeks despite a search rank of 74. The source
Week 17 row itself projected 0.47 receptions and 7.19 receiving yards, so this is not
merely an arithmetic error. It may reflect a changed role, a source issue, or other
context; this experiment does not establish which. Do not turn a surprising forecast
into an automatic trade recommendation.

## What is and is not established

Established: projections carry units, respond to league scoring, distinguish within-tier
players and can be compared without tier-boundary cliffs. Tests also confirm a fictional
two-passing-TD forecast gains four points when passing TD scoring changes from four to six.

Not established: better forecast accuracy, complete scoring, correct availability/return
assumptions, automatic championship/bye resolution, replacement value, or trade fairness.
No retrospective accuracy claim is made from potentially revised historical endpoints.
A prospective evaluation needs forecasts frozen before kickoff and later actual results,
with positional ranking accuracy compared against frozen search-rank baselines as well
as projection point error. This study does not schedule that future collection.

## Validation and boundary

- New experiment tests: 12 passed, 0 failed.
- Existing full Sleeper suite: 225 passed, 0 failed.
- Live experiment completed; `git diff --check` passed.
- No production source edits during this step. Existing uncommitted harness/verdict fixes
  preserved. New code is confined to `tests/projections/`.
- No new browser UI; browser/build/typecheck were not rerun for this calculation-only
  experiment. Dependencies are absent; historical build/typecheck results are not new checks.
- No commit, push or deployment.

Next: resolve schedule/scoring coverage, investigate anomalous source forecasts, then
expose clearly labelled production estimates in the private UI. Keep optimizer and
verdicts unchanged pending a separate decision and further evidence.

## Continuation: validated schedule and private UI

Refreshed all 14 inputs at 2026-10-28T18:51:54.058Z, now including the full Sleeper
schedule. It contains 272 games and 17 distinct game weeks for every NFL team.
The experiment derives byes only after those checks and validates each projected
team/opponent/game ID against the schedule. Source:
https://api.sleeper.app/schedule/nfl/regular/2026

Updated coverage: 1,412 covered, 109 confirmed bye player-weeks, and nine unresolved
player-weeks. All nine belong to Davante Adams, Jacory Croskey-Merritt, and Romeo
Doubs (Weeks 8–10), each currently flagged IR. Do not interpret the gap as zero or
the later forecast as a confirmed return. No schedule conflicts were found.

The four scoring gaps remain; absent forecast categories have not been relabelled
as zero or inferred through undocumented aliases. Complete league totals remain
withheld even for players with complete schedule coverage.

Harrison review: current player metadata and future projection rows consistently
identify Houston. The Texans' October 12 transaction announcement confirms the trade:
https://www.houstontexans.com/news/houston-texans-transactions-10-12-2026
The team's player statistics page lists four receptions for 40 yards in two Houston
games at retrieval: https://www.houstontexans.com/team/players-roster/marvin-harrison-jr/career
This rules out the specific suspicion of an old Arizona team assignment in the
inspected projections; it does not validate the approximately 1.5-point forecast.

The private harness now has a saved-data comparison screen via `?projection-study`:
two selectable players, baseline tiers, covered points, injury flags, byes/missing
weeks, same-week comparison, and weekly evidence. It blocks cross-position,
same-player and stale-capture comparisons. No new production route or export change.

Fresh validation in this continuation:
- 14 experiment tests plus 225 existing Sleeper tests passed (239 total).
- New desktop/mobile browser scenarios passed, including stale/missing capture states.
- All 21 existing browser checks passed.
- Desktop and mobile screenshots visually inspected; no overflow or console errors.
- Production build completed; typecheck has the same 17 diagnostic lines as the saved
  valuation baseline, byte-for-byte after extracting TypeScript diagnostic lines.
- Compatible Chromium 134 used because the default browser archive was invalid.
- Generated build output restored/removed; original working changes preserved.
- No commit, push, deployment, or production valuation change.

Decision unchanged: appropriate for private inspection, not validated as a superior
predictor or a replacement for trade verdicts. Remaining work is explicit rare-scoring
policy, confirmed league championship endpoint, and prospective accuracy evaluation.
