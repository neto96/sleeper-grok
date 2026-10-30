# Player-quality source review — 2026-10-28

## Decision and scope

Research completed; ROS player-quality integration not started. No evaluated source met the combined requirement for credible remaining-season player evaluation, suitable format context, free production access without registration, and permitted app/export use. This is a fit judgment about the sources examined, not proof that no suitable free source exists or that paid sources are more accurate.

Stats Guy Fantasy is the best candidate found for a **separately labelled redraft market-context feature**. It is not accepted here as a league-scored ROS performance assessment. Changing the planned player-quality feature to market context is a product decision left explicit, rather than silently relabelling market ranks as ROS quality. No new valuation formula, rank sums, or provider integration was introduced.

## Evidence and comparison

| Source | Evidence | Decision for this task |
| --- | --- | --- |
| Stats Guy Fantasy | Documented free keyless API, direct Sleeper IDs, separate 1QB/SF redraft and dynasty markets, TE-premium controls, roughly daily runs. Terms permit application/analysis use with linked credit and prohibit wholesale dataset republication. | Best market-context candidate; not a verified ROS production forecast. No documented PPR/half-PPR or passing-TD control. Accuracy evidence is provider-run agreement with dynasty community trade judgments, not independent redraft outcome validation. |
| The GNG / Pigskin | Open rankings API with CC BY 4.0 attribution, PPR/half/standard boards. Public API documentation describes 150-player boards. Draft baseline and experimental ROS projection pages are explicitly separate. | Reject draft baseline for ROS. ROS page discloses no validated matchup, depth-chart or availability model; historical evaluation conditions on future appearances. Documented API does not establish an ROS horizon parameter. |
| Fantasy Football Calculator | ADP API explicitly free for personal/commercial use, with attribution requested; scoring/team-count parameters. | Draft demand is not an in-season ROS assessment. Do not transform ADP into unsupported trade values. |
| GridIron Data | Free tier is player lookups/current-week projections, 50 calls/month; account/key required. ROS is listed on paid Basic. | Fails free ROS and no-registration requirements. |
| Tradyr | Free personal access, format options, timestamps; unkeyed requests capped at 50 rows. Documentation says unkeyed bulk data may include decoy entries. Significant republication and scheduled bulk collection require a key. | Not satisfactory under no-registration and reliable identity requirements. No attempt to work around caps. |
| Ball Ranks | Anonymous Model Zero API, 10 data calls/day, standard/half/PPR; published endpoints distinguish weekly and season, not ROS. Model One is paid. | Remaining-season semantics not established. Terms provide a personal license and restrict substantial copying/exploitation; export permission for this use not established. |
| GWTTKB | Free-to-view ROS tools, but terms prohibit automated extraction, redistribution and API access outside normal browser use. | Excluded. No ranking/API extraction attempted. |
| FantasyPros | Free API explicitly non-production; personal production requires HOF subscription; competition and redistribution restrictions. | Excluded under stated constraints. |
| DynastyProcess | Open repository labelled GPL-3.0, weekly updates, player IDs and FantasyPros-derived ECR/value files. | Did not establish a current redraft ROS feed with adequate upstream reuse rights for this task. Repository license alone is not verification of upstream data permissions. |
| FantasyCalc | Public pages were discoverable, but official terms rendered no readable text through the research tool. | App/Markdown permission not verified; do not infer permission from other apps using it. |

SignalTuned was also screened: its public landing page describes sign-in and an unlock for underlying numbers, not a verified free production feed. nflverse is useful upstream statistical infrastructure; this review did not find a ready-made ROS quality feed there. Building a model from historical statistics would exceed this task.

## Live checks, with limitations

Two documented, unauthenticated JSON endpoints were read directly without accounts, payment, scraping of rankings pages, or rate-limit workarounds:

1. Stats Guy Fantasy: `https://api.statsguyfantasy.com/api/v1/rankings?format=non_sf_redraft&tep=std&limit=5`
   - HTTP 200; `asOf` = `2026-10-28T13:01:24.130Z`; `total` = 217; five requested records returned with IDs, ranks, position and values.
   - Timestamp freshness and a successful small response are verified. Full-board coverage, reliability over time, and all identity matches are not.
   - Published methodology uses recency-weighted completed trades, solves markets separately, and requires participation across multiple leagues. It acknowledges a roughly 1–2 day response lag after news. Those are market estimates, not point projections.
2. GNG: `https://www.thegng.us/api/rankings.json?profile=ppr&pos=overall&limit=1`
   - `generated_at` = `2026-10-28T16:37:20Z`; `synced_at` = `2026-10-28T16:40:46Z`; one requested player record returned.
   - Includes name/team/position, rank/tier and projected PPG; the inspected record has no Sleeper ID or explicit ROS window. Fresh timestamps do not establish an appropriate forecast horizon.
   - The separate ROS page retrieved by web research was dated October 23 with evidence through Week 6. Do not conflate that page with the newer draft-board API response.

No provider was independently backtested in this run. No objective accuracy winner is claimed. A linked attribution in a few-player analytical export appears consistent with Stats Guy Fantasy's application/analysis permission, but wholesale export of its dataset is explicitly excluded. No provider data is added to this repository or its exports.

## Primary references

- Stats Guy Fantasy [API](https://statsguyfantasy.com/developers/docs), [terms](https://statsguyfantasy.com/terms), [method](https://statsguyfantasy.com/methodology/how-values-work), [accuracy comparison](https://statsguyfantasy.com/methodology/comparing-trade-calculators).
- GNG [API and license](https://www.thegng.us/feeds), [draft board](https://www.thegng.us/ranks), [ROS model disclosures](https://www.thegng.us/ranks?horizon=ros).
- Fantasy Football Calculator [API permission and parameters](https://help.fantasyfootballcalculator.com/article/42-adp-rest-api).
- GridIron Data [plans](https://www.gridirondata.com/).
- Tradyr [API and access conditions](https://api.tradyr.app/docs).
- Ball Ranks [API](https://ballranks.com/developers), [terms](https://ballranks.com/terms).
- GWTTKB [terms](https://www.gwttkb.com/terms.html).
- FantasyPros [access policy, updated August 5, 2026](https://support.fantasypros.com/hc/en-us/articles/49749297704475-How-do-I-request-access-to-the-FantasyPros-API).
- DynastyProcess [data repository](https://github.com/dynastyprocess/data).
- FantasyCalc [terms page, unreadable in research tool](https://fantasycalc.com/terms-of-usage).
- SignalTuned [public product description](https://signaltuned.com/welcome).

## Workspace and validation checkpoint

Verified checkout: `/workspace/scratch/07c459264cd4/checkpoint-repo`, main HEAD `bea0bc1dd5009d6453df3f2619cf3c5a8cba1aae`. No fetch, commit, push, publish or deployment performed.

Preserved working changes:

- `.gitignore`, `package.json`
- `src/lib/sleeper/trade-analyzer.ts` and `trade-analyzer.test.ts`: duplicate cross-context positive-evidence fix and separate availability need ordering.
- `tests/browser/`: README, app, fetch stub, fixture, HTML, runner, server and styles.

Only this review document was added by this run. No application/test code changed; all guarded engine behavior and snapshot_version 3.2 remain untouched. Tree remains intentionally dirty.

Freshly run on October 28:

```sh
node --experimental-strip-types --test src/lib/sleeper/*.test.ts src/lib/sleeper/analysis/*.test.ts
# 225 passed, 0 failed; includes starter-slot, recommended-drop and priority-waiver tests.
node --experimental-strip-types --test src/lib/sleeper/trade-analyzer.test.ts src/lib/sleeper/trade-markdown.test.ts src/lib/sleeper/trade-presentation.test.ts
# 24 passed, 0 failed.
git diff --check
# clean
```

App node_modules and the previous Chromium installation are absent in this resumed runtime. Browser/build/typecheck were not rerun for this research-only change. The previous 21 browser checks, successful build and 17 known TypeScript diagnostics are historical results, not current confirmations. Source files and saved earlier logs are present. Dependencies were not recreated and no lockfile changed.

## Resume and manual-testing boundary

Do not start the ROS integration until a suitable permitted source is established. Alternatively, explicitly scope a separate market-context feature using Stats Guy Fantasy; keep market ranks distinct from ROS performance and league-specific quality. A future adapter must retain horizon/scoring limitations, source timestamps, exact ID matching, missing/stale states, and attribution, with no influence on engine verdicts or waiver ordering.

There is no new quality UI to manually test. After restoring the existing private preview dependencies, the prior harness remains the manual-test path: analyze a fictional trade, compare UI with Copy/Save Markdown, edit/clear/change partner to verify stale-result removal, inspect an unavailable player and uneven trade, then repeat at mobile width. The documented commands remain `npm run test:preview` and `npm run test:browser`; a preview has not been launched by this run.
