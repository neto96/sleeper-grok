/** Shadow research only. No production consumers, network access, clocks or legacy imports. */
export const SHADOW_QUALITY_MODEL = "shadow-quality-v1" as const;
export const QUALITY_UNITS = "experimental_index_not_points_or_trade_price" as const;
export type QualityStatus = "current" | "stale" | "missing" | "identity_unresolved" | "unsupported";
export type FreshnessState = "fresh" | "stale" | "unknown";
export type RankingPool = { id: string; kind: "overall" | "position"; position: string | null };
export type QualityEvidence = {
  player: { sleeperId: string | null; providerId: string | null; name: string; position: string; identityResolved: boolean };
  provider: string;
  season: number;
  rankingType: string;
  scoring: string;
  format: string;
  pool: RankingPool;
  overallEcr: number | null;
  /** In an overall pool this is that pool's positional annotation, NOT a separate positional consensus. */
  positionalEcr: number | null;
  sourceUpdatedAt: string | null;
  /** Date-only source metadata is interpreted as UTC midnight, not an expert update time. */
  sourceAsOfDate: string | null;
  retrievedAt: string;
  sourceNote: string;
};
export type ExperimentalIndices = { shiftedPower: number; logarithmic: number; percentile: number };
export type ShadowQuality = {
  model: typeof SHADOW_QUALITY_MODEL;
  mode: "shadow_only";
  units: typeof QUALITY_UNITS;
  evidence: QualityEvidence | null;
  status: QualityStatus;
  freshness: FreshnessState;
  freshnessBasis: "source_update_and_retrieval" | "source_asof_and_retrieval" | "retrieval_only" | "unknown";
  indexRank: number | null;
  indices: ExperimentalIndices | null;
  notes: string[];
};
export type QualityPolicy = { season: number; now: string; maxAgeHours: number };

/** Fixed benchmark parameters, not fitted player values. Domain includes fractional ranks.
 * Log/percentile reach a continuous display floor; zero is NOT a claim of no player value.
 * No normalization by response size and no blending between ranking pools.
 */
export function experimentalQualityIndices(rank: number): ExperimentalIndices {
  if (!Number.isFinite(rank) || rank < 1) throw new RangeError("Rank must be finite and at least one.");
  return {
    shiftedPower: 100 / (1 + (rank - 1) / 24),
    logarithmic: Math.max(0, 100 * (Math.log(251) - Math.log(rank)) / Math.log(251)),
    percentile: rank >= 250 ? 0 : 100 * ((250 - rank) / 249),
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function nullableText(value: unknown): boolean { return value === null || text(value); }
function rank(value: unknown): boolean { return value === null || typeof value === "number" && Number.isFinite(value) && value >= 1; }
function dateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && dateOnly(value.slice(0,10)) && Number.isFinite(Date.parse(value));
}
function validEvidence(value: unknown): value is QualityEvidence {
  if (!object(value) || !object(value.player) || !object(value.pool)) return false;
  const p = value.player, pool = value.pool;
  return nullableText(p.sleeperId) && nullableText(p.providerId) && text(p.name) && text(p.position)
    && typeof p.identityResolved === "boolean" && text(value.provider) && Number.isInteger(value.season)
    && text(value.rankingType) && text(value.scoring) && text(value.format)
    && text(pool.id) && (pool.kind === "overall" || pool.kind === "position") && nullableText(pool.position)
    && rank(value.overallEcr) && rank(value.positionalEcr)
    && (value.sourceUpdatedAt === null || timestamp(value.sourceUpdatedAt))
    && (value.sourceAsOfDate === null || dateOnly(value.sourceAsOfDate))
    && timestamp(value.retrievedAt) && typeof value.sourceNote === "string";
}

/** Accept an externally supplied record. Malformed/unsupported evidence fails closed.
 * Precedence: unsupported -> unresolved identity -> missing rank -> stale/current.
 * Stale ranks remain visible as evidence but never receive a fresh numeric substitute.
 */
export function evaluatePlayerQuality(input: unknown, policy: QualityPolicy): ShadowQuality {
  if (!Number.isInteger(policy.season) || policy.season < 2000 || !timestamp(policy.now)
    || !Number.isFinite(policy.maxAgeHours * 3600000) || policy.maxAgeHours <= 0) throw new RangeError("Invalid explicit quality policy.");
  const result: ShadowQuality = {model:SHADOW_QUALITY_MODEL,mode:"shadow_only",units:QUALITY_UNITS,
    evidence:null,status:"unsupported",freshness:"unknown",freshnessBasis:"unknown",indexRank:null,indices:null,notes:[]};
  if (!validEvidence(input)) return {...result,notes:["Malformed external evidence; no score or fallback assigned."]};
  // Copy only contract fields; external extras (including credentials) are not propagated.
  const e: QualityEvidence = {
    player:{sleeperId:input.player.sleeperId,providerId:input.player.providerId,name:input.player.name,
      position:input.player.position,identityResolved:input.player.identityResolved},
    provider:input.provider,season:input.season,rankingType:input.rankingType,scoring:input.scoring,format:input.format,
    pool:{id:input.pool.id,kind:input.pool.kind,position:input.pool.position},overallEcr:input.overallEcr,
    positionalEcr:input.positionalEcr,sourceUpdatedAt:input.sourceUpdatedAt,sourceAsOfDate:input.sourceAsOfDate,
    retrievedAt:input.retrievedAt,sourceNote:input.sourceNote,
  };
  result.evidence=e;
  const expectedPool = `fantasypros:NFL:${e.season}:ROS:PPR:redraft-1qb:${e.pool.kind === "overall" ? "ALL" : e.pool.position}`;
  if (e.provider !== "FantasyPros" || e.season !== policy.season || e.rankingType !== "ROS" || e.scoring !== "PPR"
    || e.format !== "redraft-1qb" || !["QB","RB","WR","TE"].includes(e.player.position)
    || e.pool.id !== expectedPool || (e.pool.kind === "overall" ? e.pool.position !== null
      : e.pool.position !== e.player.position || e.overallEcr !== null)) {
    result.notes.push("Unsupported or inconsistent provider, format, season or ranking pool; no fallback assigned."); return result;
  }
  const now=Date.parse(policy.now), fetched=Date.parse(e.retrievedAt);
  const updated=e.sourceUpdatedAt === null ? null : Date.parse(e.sourceUpdatedAt);
  const asOf = e.sourceAsOfDate === null ? null : Date.parse(`${e.sourceAsOfDate}T00:00:00Z`);
  if (fetched > now || updated !== null && updated > fetched
    || asOf !== null && asOf > fetched) {
    result.notes.push("Inconsistent or future timestamps; no fallback assigned."); return result;
  }
  const maxAge=policy.maxAgeHours * 3600000;
  result.freshness = now-fetched > maxAge || updated !== null && now-updated > maxAge
    || asOf !== null && now-asOf > maxAge ? "stale" : "fresh";
  result.freshnessBasis = updated !== null ? "source_update_and_retrieval"
    : asOf !== null ? "source_asof_and_retrieval" : "retrieval_only";
  if (updated === null) result.notes.push("Expert update time unavailable; source as-of day and retrieval age are only coarse freshness evidence, not verified expert update times.");
  const selected=e.pool.kind === "overall" ? e.overallEcr : e.positionalEcr;
  if (!e.player.identityResolved || e.player.sleeperId === null || selected !== null && e.player.providerId === null) {
    result.status="identity_unresolved";result.notes.push("Identity unresolved; no name-based matching or fallback assigned.");return result;
  }
  if (selected === null) {
    result.status="missing";result.notes.push("No rank in this supplied pool; absence is not zero quality or proof of global omission. No fallback assigned.");return result;
  }
  result.indexRank=selected;
  if (result.freshness === "stale") {
    result.status="stale";result.notes.push("Evidence exceeds the explicit freshness policy; indices withheld, no hidden fallback.");return result;
  }
  result.status="current";
  result.indices=experimentalQualityIndices(selected);
  result.notes.push("Experimental indices only; not fantasy points, projected points, trade prices, ratios of player value, or an ECR trade chart. Compare only matching pool identities.");
  return result;
}
