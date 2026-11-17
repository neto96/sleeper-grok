/** Manual research import only. No network or application consumers. */
const positions = ["QB", "RB", "WR", "TE"];
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const nonempty = (x) => typeof x === "string" && x.trim().length > 0;
const rank = (x) => typeof x === "number" && Number.isFinite(x) && x >= 1;
const fail = (message) => {
  throw Error(message);
};
const date = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
export function convertEcr(inputs, { now, season, mappings = {} }) {
  if (!Number.isFinite(Date.parse(now))) fail("Invalid retrieval timestamp");
  const currentSeason = new Date(now).getUTCFullYear();
  if (season !== undefined && (!Number.isInteger(season) || season !== currentSeason))
    fail("Expected current calendar season");
  if (
    !object(mappings) ||
    Object.entries(mappings).some(([k, v]) => !/^\d+$/.test(k) || !nonempty(v)) ||
    new Set(Object.values(mappings)).size !== Object.values(mappings).length
  )
    fail("Invalid or conflicting explicit mappings");
  if (!inputs.length || inputs.filter((x) => x.pool === "ALL").length !== 1)
    fail("Exactly one ALL capture is required");
  const pools = new Set(),
    identities = new Map(),
    records = [],
    counts = {};
  let retrievalOnly = 0;
  for (const { pool, data } of inputs) {
    if (!["ALL", ...positions].includes(pool) || pools.has(pool)) fail("Invalid or duplicate pool");
    pools.add(pool);
    if (!object(data) || !Array.isArray(data.rankings) || !data.rankings.length)
      fail(`${pool}: missing rankings`);
    // Metadata, when present, must agree with the explicit CLI scope; never infer a pool from pos_rank.
    let declaredSeason = season;
    for (const meta of [data, data.metadata ?? {}, data.data_as_of ?? {}]) {
      if (!object(meta)) fail(`${pool}: malformed metadata`);
      for (const key of ["ranking_type", "rankingType", "type"])
        if (meta[key] !== undefined && meta[key] !== "ROS") fail(`${pool}: non-ROS metadata`);
      for (const key of ["scoring", "scoring_format"])
        if (meta[key] !== undefined && meta[key] !== "PPR") fail(`${pool}: non-PPR metadata`);
      for (const key of ["position", "pool"])
        if (meta[key] !== undefined && meta[key] !== pool)
          fail(`${pool}: conflicting pool metadata`);
      for (const key of ["season", "year"]) {
        if (meta[key] !== undefined) {
          if (meta[key] !== currentSeason) fail(`${pool}: mismatched season`);
          declaredSeason = meta[key];
        }
      }
      if (meta.sport !== undefined && meta.sport !== "NFL") fail(`${pool}: unsupported sport`);
      if (meta.format !== undefined && meta.format !== "redraft-1qb")
        fail(`${pool}: unsupported format`);
    }
    if (declaredSeason !== currentSeason)
      fail(`${pool}: season missing; supply --season after verifying the capture`);
    if (data.data_as_of !== undefined && data.data_as_of !== null && !object(data.data_as_of))
      fail(`${pool}: malformed data_as_of`);
    const sourceAsOfDate = date(data.data_as_of?.date) ? data.data_as_of.date : null;
    if (sourceAsOfDate && Date.parse(sourceAsOfDate) > Date.parse(now))
      fail(`${pool}: future source date`);
    const seen = new Set();
    for (const row of data.rankings) {
      if (!object(row)) fail(`${pool}: malformed row`);
      const id =
        typeof row.player_id === "number" &&
        Number.isSafeInteger(row.player_id) &&
        row.player_id > 0
          ? String(row.player_id)
          : row.player_id;
      if (
        !nonempty(id) ||
        !/^\d+$/.test(id) ||
        !nonempty(row.player_name) ||
        !positions.includes(row.position) ||
        !(row.team === null || nonempty(row.team)) ||
        !rank(row.rank_ecr)
      )
        fail(`${pool}: invalid identity, position or rank`);
      if (pool !== "ALL" && row.position !== pool)
        fail(`${pool}: row position conflicts with pool`);
      if (seen.has(id)) fail(`${pool}: duplicate provider ID`);
      seen.add(id);
      let annotation = row.pos_rank ?? null;
      // Explicit positional annotation formats only; this does not establish pool identity.
      if (typeof annotation === "string") {
        const m = /^(QB|RB|WR|TE)([1-9]\d*)$/.exec(annotation);
        if (!m || m[1] !== row.position) fail(`${pool}: invalid positional annotation`);
        annotation = Number(m[2]);
      }
      if (annotation !== null && !rank(annotation)) fail(`${pool}: invalid positional annotation`);
      if (pool !== "ALL" && annotation !== null && annotation !== row.rank_ecr)
        fail(`${pool}: conflicting positional ranks`);
      const identity = JSON.stringify([row.player_name, row.position, row.team]);
      if (identities.has(id) && identities.get(id) !== identity)
        fail(`${pool}: conflicting provider identity`);
      identities.set(id, identity);
      if (!sourceAsOfDate) retrievalOnly++;
      records.push({
        team: row.team,
        evidence: {
          player: {
            providerId: id,
            sleeperId: null,
            identityResolved: false,
            name: row.player_name,
            position: row.position,
          },
          provider: "FantasyPros",
          season: declaredSeason,
          rankingType: "ROS",
          scoring: "PPR",
          format: "redraft-1qb",
          pool: {
            id: `fantasypros:NFL:${declaredSeason}:ROS:PPR:redraft-1qb:${pool}`,
            kind: pool === "ALL" ? "overall" : "position",
            position: pool === "ALL" ? null : pool,
          },
          overallEcr: pool === "ALL" ? row.rank_ecr : null,
          positionalEcr: pool === "ALL" ? annotation : row.rank_ecr,
          sourceUpdatedAt: null,
          sourceAsOfDate,
          retrievedAt: now,
          sourceNote: "Manually supplied local research capture.",
        },
      });
    }
    counts[pool] = seen.size;
  }
  if (records.length > 5000) fail("Too many records");
  if (Object.keys(mappings).some((id) => !identities.has(id)))
    fail("Mapping refers to absent provider identity");
  return {
    capture: { version: 1, records, mappings: { ...mappings }, players: [] },
    counts,
    identities: identities.size,
    retrievalOnly,
  };
}
