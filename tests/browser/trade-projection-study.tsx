import React, { useEffect, useState } from 'react';
import { TradePanel } from '../../src/components/trade-panel';
import { simulateTradeRosters } from '../../src/lib/sleeper/trade-analyzer';
import type { AnalyzedTradeExport } from '../../src/lib/sleeper/trade-markdown';
import { makeSnapshot } from './fixture';
import { preparePreviewWeeks } from '../projections/preview-input.mjs';
import { studyPolicy } from '../projections/policy.mjs';
import { lineupEvidence } from '../projections/lineup-evidence.mjs';
import { compareProjectedRosters } from '../projections/lineup.mjs';

export function TradeProjectionStudy() {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof makeSnapshot> | null>(null);
  const [weeks, setWeeks] = useState<{week: number; points: Record<string, number | null>}[]>([]);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<ReturnType<typeof studyPolicy> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/__projection-study', {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error('Saved projection study is unavailable.');
      const data = await response.json();
      const prepared = preparePreviewWeeks(data);
      const checkedPolicy = studyPolicy(data.summary);
      setPolicy(checkedPolicy);
      setWeeks(prepared);
      setSnapshot({...makeSnapshot(), ...data.tradeInput, myRosterId:data.tradeInput.teams[0].rosterId});
    }).catch(err=>{if(err.name!=='AbortError')setError(err.message);});
    return ()=>controller.abort();
  }, []);
  const [trade, setTrade] = useState<AnalyzedTradeExport | null>(null);
  const [drops, setDrops] = useState<string[]>([]);
  const [receive] = useState(() => (value: AnalyzedTradeExport | null) => { setTrade(value); setDrops([]); });
  const teams = snapshot && trade?.result.valid ? simulateTradeRosters(
    snapshot.teams.find(t => t.rosterId === trade.request.teamAId)!,
    snapshot.teams.find(t => t.rosterId === trade.request.teamBId)!,
    trade.request.teamAPlayerIds, trade.request.teamBPlayerIds) : null;
  if (!snapshot) return <main className="p-4"><p role="status">{error || 'Loading saved trade study…'}</p></main>;
  return <main className="mx-auto max-w-5xl space-y-6 p-4">
    <h1 className="text-3xl font-semibold">Private trade projection test</h1>
    <p>Saved NLFL rosters and Sleeper forecasts. {policy?.metric}, {policy?.windowLabel}. Future availability is not guaranteed. Production verdicts remain unchanged.</p>
    <p>Excluded scoring: {policy?.exclusions.join(', ') || 'none'}. Kicker and defense points are outside this comparison.</p>
    <p>These are study weeks, not a verified championship window. Missing categories are not estimated or treated as zero.</p>
    <label>Your roster<select aria-label="Your roster" className="min-h-11 border bg-background" value={snapshot.myRosterId} onChange={e=>{setTrade(null);setDrops([]);setSnapshot({...snapshot,myRosterId:Number(e.target.value)});}}>{snapshot.teams.map(t=><option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>)}</select></label>
    <TradePanel snapshot={snapshot} myRosterId={snapshot.myRosterId} onAnalyzedTrade={receive} />
    {teams && trade?.result.valid && <section className="space-y-4" aria-live="polite">
      <h2 className="text-xl font-semibold">Experimental projected lineup impact</h2>
      {(['teamA','teamB'] as const).map(key => {
        const impact = trade.result.valid ? trade.result[key] : null;
        if (!impact) return null;
        const before=snapshot.teams.find(t=>t.rosterId===impact.rosterId)!;
        const after=teams[key];
        const active=[...after.starters,...after.bench];
        const selected=active.filter(p=>drops.includes(p.playerId));
        const comparison=compareProjectedRosters([...before.starters,...before.bench],active.filter(p=>!drops.includes(p.playerId)),
          snapshot.rosterSlots,weeks,Math.max(0,impact.rosterSize.requiredDrops-selected.length));
        return <article data-testid={`projected-${key}`} key={key} className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">{impact.teamName}</h3>
          {impact.rosterSize.requiredDrops>0 && <fieldset><legend>Choose {impact.rosterSize.requiredDrops} follow-up drops</legend>
            {active.map(p=><label key={p.playerId} className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!drops.includes(p.playerId) && selected.length >= impact.rosterSize.requiredDrops} checked={drops.includes(p.playerId)}
              onChange={()=>setDrops(old=>old.includes(p.playerId)?old.filter(id=>id!==p.playerId):[...old,p.playerId])}/>{p.name}</label>)}
          </fieldset>}
          <p>{comparison.blocked || (comparison.meanDelta===null ? 'No complete comparable offensive lineup.' : `Projected lineup change: ${comparison.meanDelta.toFixed(2)} points per comparable week.`)}</p>
          <p>{comparison.weeks.filter(w=>w.delta!==null).length} comparable weeks. Unresolved weeks excluded from the average.</p>
          {comparison.weeks.map(w=>{
            const source=weeks.find(row=>row.week===w.week)!;
            const evidence=lineupEvidence([...before.starters,...before.bench],active,
              active.filter(p=>!drops.includes(p.playerId)),snapshot.rosterSlots,source.points);
            const names=new Map([...before.starters,...before.bench,...active].map(p=>[p.playerId,p.name]));
            return <details key={w.week} className="rounded-md border p-3">
              <summary className="min-h-11 cursor-pointer">Week {w.week}: {w.delta===null ? 'Incomplete forecast or lineup' : `${w.before.points?.toFixed(2)} → ${w.after.points?.toFixed(2)}`}</summary>
              {evidence.beforeReason && <p>Before: {evidence.beforeReason}</p>}
              {evidence.afterReason && <p>After: {evidence.afterReason}</p>}
              {w.delta!==null && <>
                <p>Entering lineup: {evidence.entering.join(', ') || 'none'}</p>
                <p>Leaving lineup: {evidence.leaving.join(', ') || 'none'}</p>
                {selected.length>0 && evidence.tradeOnlyDelta!==null && <p>Transfer-only change: {evidence.tradeOnlyDelta.toFixed(2)}. Follow-up drop effect: {evidence.dropDelta!.toFixed(2)}. The transfer-only roster is a diagnostic step and may exceed capacity.</p>}
              </>}
              {([['Before',evidence.before],[selected.length ? 'After trade and drops' : 'After trade',evidence.after]] as const).map(([label,lineup])=>lineup.complete && <div key={label}>
                <p className="font-semibold">{label}</p>
                {lineup.lineup.map(entry=><p key={entry.index}>{entry.slot}: {names.get(entry.playerId) ?? entry.playerId} · {entry.points.toFixed(2)}</p>)}
              </div>)}
            </details>;
          })}
          <p className="text-sm">QB/RB/WR/TE and FLEX only; K/DEF excluded. Missing forecasts or unfilled slots suppress the comparison.</p>
        </article>;
      })}
    </section>}
  </main>;
}
