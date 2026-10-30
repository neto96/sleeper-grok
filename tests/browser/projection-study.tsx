import React, { useEffect, useState } from 'react';
import { compareCommonWeeks } from '../projections/estimate.mjs';

type Player = {
  playerId: string; name: string; position: string; tier: string; searchRank: number | null;
  injuryStatus: string | null; coveredWeeks: number; byeWeeks: number[]; unknownWeeks: number[];
  coveredSubtotal: number | null; pointsPerCoveredGame: number | null;
  weeks: { week: number; status: string; points: number | null }[];
};
type Study = { summary: { capturedAt: string; scoringGaps: string[];
  window: { season: string; fromWeek: number; throughWeek: number }; scheduleValidated: boolean };
  results: Player[] };
const points = (value: number | null) => value === null ? 'Not available' : value.toFixed(2);
const scoringNames: Record<string, string> = { fum_rec_td: 'fumble-recovery touchdowns',
  st_ff: 'special-teams forced fumbles', st_fum_rec: 'special-teams fumble recoveries',
  st_td: 'special-teams touchdowns' };

export function ProjectionStudy() {
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/__projection-study', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('No private study capture is available. Run the projection experiment first.');
      const data: Study = await response.json();
      if (!Array.isArray(data.results) || !data.summary?.window ||
        !Number.isFinite(Date.parse(data.summary.capturedAt))) throw new Error('Invalid study capture.');
      setStudy(data);
      setFirst(data.results.find(p => p.name === 'Puka Nacua')?.playerId ?? data.results[0]?.playerId ?? '');
      setSecond(data.results.find(p => p.name === 'A.J. Brown')?.playerId ?? data.results[1]?.playerId ?? '');
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, []);
  const a = study?.results.find(p => p.playerId === first);
  const b = study?.results.find(p => p.playerId === second);
  const age = study ? Date.now() - Date.parse(study.summary.capturedAt) : 0;
  const stale = age > 7 * 86400000 || age < -300000;
  const comparable = a && b && first !== second && a.position === b.position && !stale;
  const comparison = comparable ? compareCommonWeeks(a, b) : null;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Private valuation experiment</p>
      <h1 className="text-3xl font-semibold">Projected production</h1>
      <p className="text-muted-foreground">Compare current tiers with projected offensive points. This does not change trade verdicts.</p>
      <a className="inline-flex min-h-11 items-center underline" href="/">Return to fictional roster tests</a>
    </header>
    {error && <p role="alert" className="rounded-lg border p-4">{error}</p>}
    {!study && !error && <p role="status">Loading saved private study…</p>}
    {study && <>
      <section className="space-y-2 rounded-lg border bg-muted p-4 text-sm">
        <p>{study.summary.window.season} · Weeks {study.summary.window.fromWeek}–{study.summary.window.throughWeek} · Saved {new Date(study.summary.capturedAt).toLocaleString()}</p>
        <p>Read-only saved Sleeper forecasts, scored using supported NLFL categories. This screen makes no live Sleeper requests.</p>
        <p>Excluded scoring: {study.summary.scoringGaps.map(key => scoringNames[key] ?? key).join(', ') || 'none'}. Subtotals are not complete league totals.</p>
        <p>{study.summary.scheduleValidated ? 'Byes checked against the full schedule. Other missing forecasts remain unknown.' : 'Schedule not validated; missing forecasts remain unknown.'}</p>
        <p>Week 17 is the study cutoff. Forecast accuracy and championship configuration have not been validated.</p>
      </section>
      {stale && <p role="alert">Saved capture is stale or dated in the future. Comparison is disabled.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {([['Player A', a, first, setFirst], ['Player B', b, second, setSecond]] as const).map(([label, player, value, change]) =>
          <section key={label} className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
            <label className="block space-y-2 font-medium">{label}
              <select aria-label={label} className="block min-h-11 w-full rounded-md border bg-background px-3 text-foreground" value={value} onChange={e => change(e.target.value)}>
                {study.results.map(p => <option key={p.playerId} value={p.playerId}>{p.name} · {p.position}</option>)}
              </select>
            </label>
            {player && <>
              <p className="text-sm">Current tier: <strong>{player.tier}</strong> · Search rank {player.searchRank ?? 'unknown'}</p>
              <p className="text-2xl font-semibold">{points(player.pointsPerCoveredGame)} <span className="text-sm font-normal">points / covered game</span></p>
              <p>Covered subtotal: {points(player.coveredSubtotal)} points</p>
              <p className="text-sm">{player.coveredWeeks} covered · {player.byeWeeks.length} bye {player.byeWeeks.length === 1 ? 'week' : 'weeks'} · {player.unknownWeeks.length} unresolved weeks</p>
              <p className="text-sm">Current injury flag: {player.injuryStatus || 'none reported'}. Future projections do not confirm availability.</p>
            </>}
          </section>)}
      </div>
      <section className="space-y-2 rounded-lg border p-4" aria-live="polite">
        <h2 className="text-lg font-semibold">Same-week comparison</h2>
        {comparison && comparison.count > 0 ? <>
          <p data-testid="comparison">{a!.name} minus {b!.name}: {points(comparison.meanDifference)} points per game across {comparison.count} common projected weeks.</p>
          <p className="text-sm text-muted-foreground">Forecast difference only. No fairness score, replacement-value adjustment, or claim of better accuracy.</p>
        </> : <p>Select two different players at the same position with fresh, overlapping forecasts.</p>}
      </section>
      {a && b && <section className="space-y-3">
        <h2 className="text-lg font-semibold">Weekly evidence</h2>
        <div className="grid gap-2">
          {a.weeks.map(week => {
            const other = b.weeks.find(x => x.week === week.week);
            return <div key={week.week} className="grid grid-cols-3 gap-2 rounded-md border p-3 text-sm">
              <span>Week {week.week}</span>
              <span>A: {week.status === 'covered' ? points(week.points) : week.status.replaceAll('_', ' ')}</span>
              <span>B: {other?.status === 'covered' ? points(other.points) : other?.status.replaceAll('_', ' ') ?? 'missing'}</span>
            </div>;
          })}
        </div>
      </section>}
    </>}
  </main>;
}
