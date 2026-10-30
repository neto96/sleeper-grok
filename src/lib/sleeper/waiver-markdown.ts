import type {LeagueSnapshot} from './types.ts';
import type {ProjectedWaivers} from './waiver-valuation.ts';
export type WaiverExport = {snapshot:LeagueSnapshot; result:ProjectedWaivers};
const plain=(s:string)=>s.replace(/[\r\n]+/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_\[\]~#]/g,'\\$&');
export function appendWaiverMarkdown(markdown:string,snapshot:LeagueSnapshot,comparison:WaiverExport|null):string {
  if(!comparison || comparison.snapshot!==snapshot || comparison.result.status!=='ready' || !snapshot.projections)return markdown;
  const {result}=comparison,p=snapshot.projections;
  return markdown+'\n\n'+[
    '## Projected Waiver Comparison','',
    'Hypothetical only; no Sleeper roster move has been made.',
    `- Roster: ${plain(snapshot.teams.find(t=>t.rosterId===snapshot.myRosterId)?.teamName ?? String(snapshot.myRosterId))}.`,
    `- ${result.dropName ? `Hypothetical drop: ${plain(result.dropName)}` : 'Using an open roster spot'}.`,
    `- Window: Weeks ${p.effectiveFromWeek ?? p.fromWeek}–${p.throughWeek}; not a verified fantasy championship window.`,
    `- Core offense only; K/DEF excluded. Scoring exclusions: ${p.exclusions.map(plain).join(', ')||'none'}.`,
    '- Values compare only fully future weeks with verified timing; same-day or unknown timing is excluded. They are projected starting-lineup changes per week, assuming future participation. Missing forecasts are unknown, not zero.','',
    ...result.rows.slice(0,12).map(r=>`- ${plain(r.name)} (${plain(r.position)}): ${r.delta===null?'Unknown — incomplete forecast or lineup':`${r.delta>=0?'+':''}${r.delta.toFixed(2)} points/week`}${r.uncertain?' · Questionable':''}.`),
    '',`${result.rows.filter(r=>r.delta!==null).length} fully comparable candidates; ${result.rows.filter(r=>r.delta===null).length} unknown.`,'',
  ].join('\n');
}
