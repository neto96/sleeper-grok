import type { QualityFixture } from "../report.ts";
import type { QualityEvidence } from "../../../src/lib/sleeper/player-quality.ts";
export type Subject = {
  id: string;
  name: string;
  position: string;
  searchRank: number | null;
  status: string | null;
  injuryStatus: string | null;
  evidence: QualityEvidence;
};
export type Scenario = {
  id: string;
  kind: "roster" | "waiver" | "trade";
  note: string;
  slots: string[];
  roster: Subject[];
  incoming: Subject[];
  outgoing: string[];
  drops: string[];
  capacity: number;
  points: Record<string, number | null>;
  stale?: boolean;
  cliff?: boolean;
};
/** All roster compositions, normalized availability, projections and trade offers below are synthetic.
 * Only unmodified source ranks/identities come from the frozen Phase 1 observations.
 */
export function scenarios(f: QualityFixture): Scenario[] {
  const p = (name: string): Subject => {
    const row = f.players.find((p) => p.name === name)!;
    const e = structuredClone(row.evidence.find((e) => e.pool.kind === "overall")!);
    return {
      id: e.player.sleeperId!,
      name,
      position: e.player.position,
      searchRank: row.legacy.searchRank,
      status: "Active",
      injuryStatus: null,
      evidence: e,
    };
  };
  const base = (
    id: string,
    kind: Scenario["kind"],
    names: string[],
    slots: string[],
    note: string,
  ): Scenario => ({
    id,
    kind,
    note,
    slots,
    roster: names.map(p),
    incoming: [],
    outgoing: [],
    drops: [],
    capacity: names.length,
    points: {},
  });
  const rows: Scenario[] = [];
  rows.push(
    base(
      "jacobs-love",
      "roster",
      ["Jeremiyah Love", "Josh Jacobs"],
      ["RB"],
      "Both normalized healthy; input order exposes a legacy elite tie.",
    ),
  );
  rows.push(
    base(
      "laporta-flex",
      "roster",
      ["Sam LaPorta", "Rome Odunze"],
      ["FLEX"],
      "Same legacy strong tier; legal TE/WR FLEX competition.",
    ),
  );
  rows.push(
    base(
      "odunze-brown",
      "roster",
      ["Rome Odunze", "A.J. Brown"],
      ["WR"],
      "Healthy control; cross-tier and ECR direction agree.",
    ),
  );
  const availability = base(
    "waddle-out",
    "roster",
    ["Jaylen Waddle", "Rome Odunze"],
    ["WR"],
    "Synthetic Waddle Out: compare ROS asset retention with current usability.",
  );
  availability.roster[0].injuryStatus = "Out";
  rows.push(availability);
  rows.push(
    base(
      "wilson-missing",
      "roster",
      ["Michael Wilson", "Rome Odunze"],
      ["WR"],
      "Wilson absence in supplied pools blocks complete shadow comparison.",
    ),
  );
  const stale = base(
    "stale-laporta",
    "roster",
    ["Sam LaPorta", "Rome Odunze"],
    ["FLEX"],
    "Same observations evaluated after their explicit 72-hour policy expires.",
  );
  stale.stale = true;
  rows.push(stale);
  const cliff = base(
    "adjacent-cliff",
    "roster",
    ["Rome Odunze", "A.J. Brown"],
    ["WR"],
    "Fully synthetic ranks: search 50 vs 51, overall ECR 51 vs 50; isolates the legacy boundary.",
  );
  cliff.roster.forEach((p, i) => {
    p.id = `synthetic-cliff-${i}`;
    p.name = `Synthetic boundary ${i + 1}`;
    p.searchRank = 50 + i;
    p.evidence.player = { ...p.evidence.player, sleeperId: p.id, providerId: p.id, name: p.name };
    p.evidence.overallEcr = 51 - i;
    p.evidence.positionalEcr = null;
    p.evidence.sourceNote = "Synthetic boundary control, not a FantasyPros observation.";
  });
  cliff.cliff = true;
  rows.push(cliff);
  rows.push(
    base(
      "replacement-pool",
      "roster",
      ["Sam LaPorta", "Rome Odunze", "Courtland Sutton"],
      ["TE", "FLEX"],
      "LaPorta is indispensable for TE even when a WR has higher ROS quality.",
    ),
  );
  const waiver = base(
    "immediate-wr-bye",
    "waiver",
    ["Rome Odunze"],
    ["WR"],
    "Synthetic Week 10 Sutton bye (not a claim about the live schedule); other forecasts are invented: Sutton bye, Thomas 12, Lane 18, Johnston 10, Odunze 5.",
  );
  waiver.capacity = 2;
  waiver.incoming = [
    "Courtland Sutton",
    "Brian Thomas Jr.",
    "Ja'Kobi Lane",
    "Quentin Johnston",
  ].map(p);
  waiver.points = Object.fromEntries(
    [...waiver.roster, ...waiver.incoming].map((p, i) => [p.id, [5, null, 12, 18, 10][i]]),
  );
  rows.push(waiver);
  const trade = (
    id: string,
    names: string[],
    incoming: string[],
    outgoing: string[],
    slots: string[],
    note: string,
    values: number[],
  ) => {
    const s = base(id, "trade", names, slots, note);
    s.incoming = incoming.map(p);
    s.outgoing = outgoing.map((n) => p(n).id);
    s.points = Object.fromEntries([...s.roster, ...s.incoming].map((p, i) => [p.id, values[i]]));
    return s;
  };
  const two = trade(
    "two-for-one-cuts",
    ["Joe Burrow", "Courtland Sutton"],
    ["Rome Odunze", "Brian Thomas Jr."],
    ["Joe Burrow"],
    ["WR"],
    "Synthetic 1-for-2 receipt: stronger single asset leaves; WR lineup improves; Sutton must be cut. QB slot deliberately absent in this reduced roster-fit control.",
    [20, 5, 18, 12],
  );
  two.drops = [p("Courtland Sutton").id];
  rows.push(two);
  const unresolved = structuredClone(two);
  unresolved.id = "two-for-one-unresolved";
  unresolved.note = "Same offer with required cut unselected: final roster value blocked.";
  unresolved.drops = [];
  rows.push(unresolved);
  const consolidate = trade(
    "three-for-one",
    ["Courtland Sutton", "Brian Thomas Jr.", "Ja'Kobi Lane", "Sam LaPorta"],
    ["A.J. Brown"],
    ["Courtland Sutton", "Brian Thomas Jr.", "Ja'Kobi Lane"],
    ["WR", "TE"],
    "Synthetic 3-for-1 consolidation. Two open bench spots; no automatic waiver replacement is assumed.",
    [8, 12, 10, 9, 22],
  );
  rows.push(consolidate);
  rows.push(
    trade(
      "weaker-out-improves",
      ["Courtland Sutton", "Sam LaPorta"],
      ["Rome Odunze"],
      ["Courtland Sutton"],
      ["WR", "TE"],
      "Synthetic 1-for-1: weaker ROS asset leaves and projected lineup improves.",
      [8, 9, 18],
    ),
  );
  const costly = trade(
    "costly-cut",
    ["Joe Burrow", "A.J. Brown"],
    ["Rome Odunze", "Brian Thomas Jr."],
    ["Joe Burrow"],
    ["WR"],
    "Synthetic selected cut Brown reveals a projected loss hidden by the illegal pre-cut roster; do not assess this offer before cuts.",
    [20, 25, 18, 12],
  );
  costly.drops = [p("A.J. Brown").id];
  rows.push(costly);
  rows.push(
    trade(
      "trade-missing",
      ["Michael Wilson", "Sam LaPorta"],
      ["Rome Odunze"],
      ["Michael Wilson"],
      ["WR", "TE"],
      "Synthetic trade: projected improvement is computable but asset-quality comparison is blocked.",
      [8, 9, 18],
    ),
  );
  return rows;
}
