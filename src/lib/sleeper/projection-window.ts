import type {LeagueSnapshot} from './types.ts';
/** Derive a comparison window from an intact source snapshot; never invent missing weeks. */
export function withProjectionEndWeek(source:LeagueSnapshot,throughWeek:number):LeagueSnapshot {
 const data=source.projections;
 if(!data || !Number.isInteger(throughWeek) || throughWeek<data.fromWeek || throughWeek>data.throughWeek)throw new Error('End week is outside the loaded projection window.');
 return {...source,projections:{...data,throughWeek,
   weeks:data.weeks.filter(w=>w.week<=throughWeek),
   players:data.players.map(p=>{
     const weeks=p.weeks.filter(w=>w.week<=throughWeek),covered=weeks.filter(w=>w.status==='covered');
     const unknownWeeks=weeks.filter(w=>!['covered','bye'].includes(w.status)).map(w=>w.week);
     const subtotal=covered.length?covered.reduce((sum,w)=>sum+w.points!,0):null;
     return {...p,weeks,coveredWeeks:covered.length,unknownWeeks,byeWeeks:weeks.filter(w=>w.status==='bye').map(w=>w.week),
       coveredSubtotal:subtotal,pointsPerCoveredGame:subtotal===null?null:subtotal/covered.length,
       remainingTotal:unknownWeeks.length===0 && p.scoringGaps.length===0?subtotal:null};
   })}};
}
