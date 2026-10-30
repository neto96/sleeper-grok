# Private projected-production experiment

The calculation and source-validation studies remain private. The projected lineup
optimizer now lives in `src/lib/sleeper/projected-valuation.ts`; `lineup.mjs` re-exports
it so the private preview exercises the shared app implementation. The module also
computes roster-specific points above bench/supplied available replacements.
`src/lib/sleeper/projected-trade.ts` combines the existing validated trade simulator
with projected lineup comparisons and validates follow-up drops. Snapshot refresh now supplies live validated projection data through
`projections.server.ts` for matching current NFL regular-season leagues. The adapter
uses an explicitly labelled NFL Week-18 endpoint, not a verified fantasy championship.
Main trade verdicts now use complete-window projected lineup changes with explicit
structural fallback. Main-screen follow-up drops are included in analysis and exports;
the main waiver screen ranks hypothetical adds by projected lineup change after a
selected drop (or using an open slot). Ready waiver comparisons are included in copied/saved Markdown; JSON remains unchanged. Projection
payloads are excluded from the existing JSON export.
Snapshot version remains 3.2; the canonical Python implementation is unchanged.

## Reproduce

From the repository root, using Python's standard library and Node 24:

```sh
node --experimental-strip-types --test tests/projections/*.test.mjs
python tests/projections/collect.py --league 1389736505374691328 --season 2026 --from-week 8 --through-week 17
node --experimental-strip-types tests/projections/run.mjs
```

The collector makes 14 read-only requests for this window, at most three concurrently.
There is no polling, authentication, payment, or publishing. Live responses and the
comparison are saved only under git-ignored `test-results/projections/`. Each run
replaces that working capture after preserving old and new captures in a content-addressed
local archive. This is not remote backup: ignored data can be lost with the workspace.
Fixture tests
contain only fictional projections and do not call Sleeper.

Week 17 is an explicit study cutoff, not an automatically inferred playoff endpoint.
Do not reuse it for other leagues without checking their championship settings.

## Interpretation and safeguards

- Compare the same player's projected statistics under actual league scoring, then
  compare same-position players over the SAME covered weeks. Do not sum player ranks
  or use combined bench points as a trade fairness score.
- Supported categories: passing/rushing/receiving yards, TDs and two-point conversions,
  receptions, interceptions, fumbles lost. Missing supported fields in otherwise valid
  sparse forecasts are assumed zero; malformed values invalidate that week.
- Rare offensive/special-teams scoring rules are explicitly flagged rather than silently
  ignored. Kicker/defense-only categories are outside this offensive-only experiment.
- A supported-stat subtotal is not a fully scored league total. `remainingTotal` stays
  null when unsupported scoring or unknown weeks remain.
- Missing records and ADP-only placeholders are unknown, never zero. The live study
  now validates all 272 scheduled games, 17 per team, before deriving bye weeks.
  Forecast teams, opponents and game IDs must match that schedule. An incomplete
  schedule fails the run instead of manufacturing byes. A forecast on a bye is rejected.
- Wrong season/week/player, actual-stat rows, duplicates, malformed statistics,
  missing timestamps, and forecasts more than seven days old are not accepted.
  Seven days is an experimental freshness policy, not a provider guarantee.
- Retain injury flags separately. Future-week forecasts do not certify return dates.
- Forecast differences prove finer distinctions, not better predictions. Historical
  endpoints may not preserve forecasts as known before kickoff. Accuracy validation
  needs a separate append-only, pregame archive and outcomes in matching scoring.

## Access context

Sleeper's official documentation describes its public API as free for non-commercial
use: https://docs.sleeper.com/. The projection endpoints used here are not documented
there. Private use fits the stated purpose better than distributing a public data
product, but successful access is not an explicit license to redistribute the upstream
projection feed. This experiment does not publish raw data or change app exports.

## Acceptance boundary

Schedule/byes, source consistency checks, and the explicit core-offense scoring policy
are implemented. Projected roster marginal benefit is available in the private trade
screen. Remaining adoption gates are confirmed championship configuration, review of
scoring exclusions and roster-fit interpretation, and prospective accuracy evaluation.
Do not promote this module to production or change verdicts merely because it produces
finer numerical distinctions. Replacement-value calibration remains separate work.

## Private screen

After generating `comparison.json`, the existing private preview supports
`?projection-study`. It displays the saved study, separate from the fictional roster
UI. Select two same-position players to compare matching covered weeks. Injury flags,
confirmed byes, missing forecasts and excluded scoring categories remain visible.
The screen fetches only the locally saved comparison, never live provider data. It
does not modify snapshot Markdown, JSON exports or trade results. Captures older than
seven days disable the comparison; absent captures show an error.

Browser validation: `node tests/browser/projection-study.test.mjs` (same executable
override as the existing browser runner). This requires a generated private capture.

## Trade-lineup prototype

Weekly results now expose lineup evidence: before/after player assignments, entering
and leaving players, named missing forecasts, and insufficient-lineup explanations.
For resolved uneven trades, transfer-only and drop-only effects are calculated on
the same week and displayed only when all three lineups are complete. Their sum
equals the final change; the transfer-only roster is explicitly diagnostic and may
be over capacity. No separate package-fairness score is introduced.

Scoring policy is now explicit and versioned as `core-offense-v1`: QB/RB/WR/TE
production using supported league categories; K/DEF outside the metric. The four
known rare categories are listed exclusions, not estimated zeros. Any additional
unrecognized scoring gap blocks the preview for review. The policy is generated
with the study and independently validated when loading the trade screen.
The window label follows the capture bounds; it never certifies a championship
endpoint from an unverified numeric playoff-round code. These safeguards permit
private supplementary analysis without misrepresenting complete league scoring.

The private `?trade-projections` view loads derived saved live rosters and per-week
projections from `comparison.json`; regenerate with `run.mjs` after collecting.
Team names are neutral roster-ID labels, without ownership inference.

The view selects a user roster, preserves the real TradePanel workflow, checks forecast
age, and compares complete offensive lineups on common weeks. Follow-up drops apply
only to the experimental view. Missing forecasts remain blocking unknowns. K/DEF
occupy roster capacity but do not require points for the offensive objective.
Rare scoring exclusions, future injury uncertainty and the explicit Week-17 cutoff
remain visible. This is supplementary evidence, not a validated fairness verdict.

## Forecast archive and outcome evaluation

`archive.py` preserves captures under their SHA-256 filename with exclusive creation.
The collector now archives before replacing its working view. Existing captures can
be preserved with `python tests/projections/archive.py`; no timestamps are rewritten.

`evaluation.mjs` provides tested pregame eligibility and paired evaluation functions.
No automated collection or outcome ingestion is scheduled. Exact kickoff timestamps
are preferred; date-only games conservatively exclude same-day captures. Outcome
records must be final, scored using identical categories, and matched to frozen IDs,
weeks and seasons. Missing outcomes are excluded, never converted to zero. Report
projection MAE and same-position pair ordering against frozen search ranks on the
same cohort, with ties explicit. Pair counts are not independent sample sizes and
these descriptive functions do not automatically declare a winner.

October 28 continuation: archived the existing capture as
`5527fc41ab9bba6cec2528f0131b68d98c327cf64ee1cf101e9a942b8e570ac1`.
18 experiment tests plus 225 Sleeper tests passed (243 total); archive preservation
and idempotence also checked. No production/UI changes in this continuation, so
browser/build/typecheck results from the preceding pass were not rerun.

Championship review: Sleeper describes the standard six-team, Week-15 start as a
Week-17 finish (https://sleeper.com/blog/how-do-fantasy-playoffs-work/). The saved league
settings show six teams, start 15, round-type code 0. The numeric round-type mapping
was not established from official documentation; Week 17 remains an explicit study
cutoff rather than silently assuming all leagues use one-week rounds.
