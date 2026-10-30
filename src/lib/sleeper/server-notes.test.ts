import assert from "node:assert/strict";
import test from "node:test";
import "./resolve-ts-register.mjs";

test("server snapshot reports all analysis layers while preserving version 3.2 and starter indices", async (t) => {
  const nflTeams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
  const schedule = Array.from({length:17},(_,w)=>Array.from({length:16},(_,i)=>({
    week:w+1,home:nflTeams[i*2],away:nflTeams[i*2+1],game_id:`${w+1}-${i}`}))).flat();
  let projectionCalls=0;
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    let value: unknown = [];
    if (url.endsWith("/league/test")) value = { league_id: "test", name: "Test", season: "2026", season_type: "regular", status: "in_season", sport: "nfl", roster_positions: ["QB", "WR", "K", "DEF", "BN"], scoring_settings: { rec: 1 } };
    else if (url.endsWith("/rosters")) value = [{ roster_id: 1, owner_id: null, players: ["wr", "k", "NE"], starters: ["0", "wr", "k", "NE"] }];
    else if (url.endsWith("/state/nfl")) value = { week: 6, display_week: 6, season: "2026", season_type: "regular" };
    else if (url.endsWith("/players/nfl")) value = {
      wr: { full_name: "Test WR", position: "WR", team: "BUF", status: "Active", search_rank: 100 },
      k: { full_name: "Test K", position: "K", team: "BUF", status: "Active" },
      NE: { full_name: "New England", position: "DEF", team: "NE", status: "Active" },
    };
    else if (url.includes('/schedule/')) value = schedule;
    else if (url.includes('/projections/')) {
      projectionCalls++;
      const week=Number(url.match(/2026\/(\d+)/)![1]);
      value=week===18 ? [] : [{player_id:'wr',week,season:'2026',season_type:'regular',category:'proj',
        team:'BUF',opponent:'BAL',game_id:`${week}-1`,updated_at:Date.now(),stats:{rec:2,rec_yd:20}}];
    }
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const { loadLeagueSnapshot } = await import("./sleeper.server.ts");
  const snapshot = await loadLeagueSnapshot("test", 1);
  assert.equal(projectionCalls,13);
  assert.equal(snapshot.projections?.available,true);
  assert.equal(snapshot.projections?.weeks[0].points.wr,2);
  assert.equal(snapshot.projections?.weeks.at(-1)?.points.wr,null);
  const {snapshotJson}=await import('./format.ts');
  assert.equal(Object.hasOwn(snapshotJson(snapshot),'projections'),false);
  assert.equal(snapshot.snapshotVersion, "3.2");
  assert.match(snapshot.notes.join(" "), /V3\.3 structural model, V3\.4 availability analysis, and V3\.5 future-readiness and recommendation layers/);
  assert.doesNotMatch(snapshot.markdown, /Fantasy analysis is the V3\.3 configuration-driven model/);
  assert.match(snapshot.markdown, /snapshot_version stays 3\.2/);
  assert.deepEqual(snapshot.teams[0]?.starters.map(p => [p.playerId, p.slot]), [["wr", "WR"], ["k", "K"], ["NE", "DEF"]]);
});
