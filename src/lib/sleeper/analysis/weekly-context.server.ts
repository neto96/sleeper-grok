import {
  resolveWeeklyContexts,
  type ExternalWeeklyPlayer,
  type PlayerIdentity,
  type PlayerWeeklyContextResult,
} from "./weekly-context.ts";

// Server-only opt-in: FIRECRAWL_API_KEY enables one cached Alexandria call per season/week/scoring.
// Successful results are memoized for 15 minutes; failures for one minute to avoid
// retry loops. There is no retry, and a stale successful result survives refresh failure.
export const WEEKLY_CONTEXT_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const PROVIDER = "fantasydata-com";
const CAPABILITY = "fantasy-sports-rankings/rankings";

export type WeeklyContextRequest = {
  apiKey: string | null | undefined;
  season: string;
  week: number;
  scoring: "STD" | "HALF" | "PPR";
  players: PlayerIdentity[];
};

export type WeeklyContextLoad = {
  available: boolean;
  failure: "missing_credentials" | "fetch_failed" | "invalid_payload" | null;
  stale: boolean;
  byPlayerId: Record<string, PlayerWeeklyContextResult>;
};

type ProviderData = { records: ExternalWeeklyPlayer[]; observedAt: string | null };
type CacheEntry = {
  expiresAt: number;
  value: WeeklyContextLoad;
  providerData?: ProviderData;
};
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

function failed(failure: WeeklyContextLoad["failure"]): WeeklyContextLoad {
  return { available: false, failure, stale: false, byPlayerId: {} };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractProviderPayload(value: unknown): Record<string, unknown> | null {
  const root = object(value);
  const data = object(root.data);
  const alexandria = Array.isArray(data.alexandria) ? data.alexandria : [];
  for (const item of alexandria) {
    const result = object(item);
    if (result.provider !== PROVIDER) continue;
    const inner = object(result.data);
    if (Array.isArray(inner.players)) return inner;
    if (Array.isArray(result.players)) return result;
  }
  if (Array.isArray(data.players)) return data;
  if (Array.isArray(root.players)) return root;
  return null;
}

function cacheKey(request: WeeklyContextRequest): string {
  return `${request.season}:${request.week}:${request.scoring}`;
}

function resolveProviderData(
  request: WeeklyContextRequest,
  data: ProviderData,
  stale = false,
): WeeklyContextLoad {
  return {
    available: true,
    failure: stale ? "fetch_failed" : null,
    stale,
    byPlayerId: resolveWeeklyContexts(
      request.players,
      data.records,
      request.week,
      PROVIDER,
      CAPABILITY,
      data.observedAt,
    ),
  };
}

export function createWeeklyContextLoader(
  fetcher: Fetcher = fetch,
  now: () => number = Date.now,
) {
  const cache = new Map<string, CacheEntry>();
  return async function load(request: WeeklyContextRequest): Promise<WeeklyContextLoad> {
    if (!request.apiKey) return failed("missing_credentials");
    const key = cacheKey(request);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      return cached.providerData
        ? resolveProviderData(request, cached.providerData, cached.value.stale)
        : cached.value;
    }
    try {
      const response = await fetcher("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          alexandria: {
            provider: PROVIDER,
            capability: CAPABILITY,
            options: { position: "ALL", scoring: request.scoring },
          },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("provider_request_failed");
      const payload = await response.json() as unknown;
      const root = object(payload);
      if (root.success === false) throw new Error("provider_request_failed");
      const providerPayload = extractProviderPayload(payload);
      const week = Number(providerPayload?.week);
      if (!providerPayload || !Array.isArray(providerPayload.players) || week !== request.week) {
        const value = cached?.providerData
          ? { ...resolveProviderData(request, cached.providerData, true), failure: "invalid_payload" as const }
          : failed("invalid_payload");
        cache.set(key, { expiresAt: now() + FAILURE_TTL_MS, value, providerData: cached?.providerData });
        return value;
      }
      const records = providerPayload.players.filter((row): row is ExternalWeeklyPlayer =>
        row != null && typeof row === "object" && !Array.isArray(row),
      );
      const observedAtMs = Number(providerPayload.observed_at_ms);
      const observedAt = Number.isFinite(observedAtMs) && observedAtMs > 0
        ? new Date(observedAtMs).toISOString()
        : null;
      const providerData = { records, observedAt };
      const value = resolveProviderData(request, providerData);
      cache.set(key, { expiresAt: now() + WEEKLY_CONTEXT_TTL_MS, value, providerData });
      return value;
    } catch {
      const fallback = cached?.providerData
        ? resolveProviderData(request, cached.providerData, true)
        : failed("fetch_failed");
      cache.set(key, { expiresAt: now() + FAILURE_TTL_MS, value: fallback, providerData: cached?.providerData });
      return fallback;
    }
  };
}

const loadCached = createWeeklyContextLoader();

export function loadAlexandriaWeeklyContext(request: WeeklyContextRequest): Promise<WeeklyContextLoad> {
  return loadCached(request);
}
