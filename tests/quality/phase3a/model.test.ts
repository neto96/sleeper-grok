import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { normalizeCapture, resolveIdentity, rosAssets } =
  await import("../../../src/lib/local-quality/model.ts");
const { localQualityEnabled, readLocalQuality } =
  await import("../../../scripts/local-quality-plugin.mjs");
const { makeProjectionSnapshot } = await import("../../browser/fixture.ts");
const { snapshotJson } = await import("../../../src/lib/sleeper/format.ts");
const { analyzeTrade } = await import("../../../src/lib/sleeper/trade-analyzer.ts");
const { projectedWaivers } = await import("../../../src/lib/sleeper/waiver-valuation.ts");
const { priorityWaiverGroups } = await import("../../../src/lib/sleeper/priority-waivers.ts");
const { capture, evidence, now } = await import("./fixture.ts");
function snapshot() {
  const s = makeProjectionSnapshot();
  s.season = "2026";
  s.scoring = "PPR";
  s.analysisWaiverPool = [
    { player_id: "free-1", name: "Synthetic Receiver", position: "WR", team: "TST" },
    { player_id: "free-2", name: "Second Receiver", position: "WR", team: "TST" },
  ];
  return s;
}
test("schema rejects malformed files and strips unknown fields", () => {
  assert.throws(() => normalizeCapture({ records: [] }));
  assert.throws(() => normalizeCapture({ ...capture(), records: [{ evidence: {}, team: null }] }));
  const c = normalizeCapture({ ...capture(), secret: "should not escape" }, now);
  assert.ok(!("secret" in c));
  assert.equal(c.records[0].evidence.sourceNote, "Manually supplied local research capture.");
});
test("raw overall ranks ordered, positional annotation separate, input immutable", () => {
  const c = capture();
  c.records.push({ evidence: evidence("free-2", 10), team: "TST" });
  const s = snapshot(),
    before = JSON.stringify([s, c]);
  assert.deepEqual(
    rosAssets(c, s, now).rows.map((p) => p.id),
    ["free-2", "free-1"],
  );
  assert.equal(JSON.stringify([s, c]), before);
});
test("missing positional-only stale unsupported evidence never supplies overall order", () => {
  for (const kind of ["missing", "position", "stale", "unsupported"] as const) {
    const c = capture(),
      e = c.records[0].evidence;
    if (kind === "missing") e.overallEcr = null;
    if (kind === "position") {
      e.pool = {
        kind: "position",
        position: "WR",
        id: "fantasypros:NFL:2026:ROS:PPR:redraft-1qb:WR",
      };
      e.overallEcr = null;
    }
    if (kind === "stale") e.sourceUpdatedAt = "2026-11-01T00:00:00Z";
    if (kind === "unsupported") e.scoring = "HALF";
    assert.equal(rosAssets(c, snapshot(), now).rows.length, 0, kind);
  }
  const c = normalizeCapture(capture(), now);
  c.records[0].qualityStatus = "stale";
  assert.equal(rosAssets(c, snapshot(), now).rows.length, 0);
});
test("mapping precedence, exact normalization, shared IDs, ambiguity and conflict rejection", () => {
  const c = normalizeCapture(capture(), now),
    r = c.records[0];
  r.evidence.player.sleeperId = null;
  const p = {
    sleeperId: "free-1",
    name: "Synthetic Receiver",
    position: "WR" as const,
    team: "TST",
    externalIds: { yahoo: "one" },
  };
  assert.equal(resolveIdentity(r, c, [p]), "free-1");
  assert.equal(resolveIdentity(r, c, [p, { ...p, sleeperId: "other" }]), null);
  r.evidence.player.name = "Different name";
  assert.equal(resolveIdentity(r, c, [p]), null);
  r.externalIds = { yahoo: "one" };
  assert.equal(resolveIdentity(r, c, [p]), "free-1");
  c.mappings["fp-free-1"] = "missing";
  assert.equal(resolveIdentity(r, c, [p]), null);
  c.mappings["fp-free-1"] = "free-1";
  assert.equal(resolveIdentity(r, c, [p]), "free-1");
  r.evidence.player.sleeperId = "other";
  assert.equal(resolveIdentity(r, c, [p]), null);
});
test("duplicate pool and many-to-one provider IDs blocked; positional record does not override", () => {
  const c = capture();
  c.records.push(structuredClone(c.records[0]));
  assert.equal(rosAssets(c, snapshot(), now).rows.length, 0);
  c.records[1].evidence.pool = {
    kind: "position",
    position: "WR",
    id: "fantasypros:NFL:2026:ROS:PPR:redraft-1qb:WR",
  };
  c.records[1].evidence.overallEcr = null;
  assert.equal(rosAssets(c, snapshot(), now).rows.length, 1);
  c.records[1].evidence.player.providerId = "different";
  assert.equal(rosAssets(c, snapshot(), now).rows.length, 0);
});
test("rostered players excluded and unsupported league configurations withheld", () => {
  const s = snapshot();
  s.teams[0].bench.push({ ...s.teams[0].bench[0], playerId: "free-1" });
  assert.equal(rosAssets(capture(), s, now).rows.length, 0);
  for (const value of ["HALF", "STD"]) {
    const s = snapshot();
    s.scoring = value;
    assert.equal(rosAssets(capture(), s, now).rows.length, 0);
  }
  const sf = snapshot();
  sf.rosterSlots.push("SUPER_FLEX");
  assert.equal(rosAssets(capture(), sf, now).rows.length, 0);
});
test("local file present absent malformed and production read guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-test-"));
  try {
    assert.deepEqual(await readLocalQuality(root, true), { status: "absent" });
    await mkdir(join(root, "local-data"));
    await writeFile(join(root, "local-data/fantasypros-quality.json"), JSON.stringify(capture()));
    assert.equal((await readLocalQuality(root, true)).status, "loaded");
    assert.deepEqual(await readLocalQuality(root, false), { status: "disabled" });
    await writeFile(join(root, "local-data/fantasypros-quality.json"), "{bad");
    assert.equal((await readLocalQuality(root, true)).status, "invalid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("only explicitly enabled development serve can read; production/build/preview denied", () => {
  for (const command of ["build", "serve"])
    for (const mode of ["production", "development"])
      for (const isPreview of [true, false])
        assert.equal(
          localQualityEnabled(
            { command, mode, isPreview },
            { LOCAL_QUALITY_ENABLED: "1", NODE_ENV: "development" },
          ),
          command === "serve" && mode === "development" && !isPreview,
        );
  assert.equal(
    localQualityEnabled(
      { command: "serve", mode: "development", isPreview: false },
      { LOCAL_QUALITY_ENABLED: "1", NODE_ENV: "production" },
    ),
    false,
  );
  assert.equal(
    localQualityEnabled({ command: "serve", mode: "development", isPreview: false }, {}),
    false,
  );
});
test("existing optimizer/structural, waiver, projection, trade and snapshot outputs unchanged", () => {
  const s = snapshot();
  const observe = () =>
    JSON.stringify({
      s,
      json: snapshotJson(s),
      priority: priorityWaiverGroups(s),
      projected: projectedWaivers(s),
      trade: analyzeTrade(s, {
        teamAId: s.myRosterId,
        teamBId: 20,
        teamAPlayerIds: [`${s.myRosterId}-4`],
        teamBPlayerIds: ["20-4"],
      }),
    });
  const before = observe();
  rosAssets(capture(), s, now);
  assert.equal(observe(), before);
  assert.equal(snapshotJson(s).snapshot_version, "3.2");
});
test("one provider cannot claim two Sleeper identities; unverified stored IDs need independent matching", () => {
  const c = capture();
  c.records.push({
    team: "TST",
    evidence: {
      ...evidence("free-2", 10),
      player: { ...evidence("free-2").player, providerId: "fp-free-1" },
    },
  });
  assert.equal(rosAssets(c, snapshot(), now).rows.length, 0);
  const r = capture().records[0];
  r.evidence.player.identityResolved = false;
  r.evidence.player.name = "Unknown name";
  assert.equal(
    resolveIdentity(r, capture(), [
      { sleeperId: "free-1", name: "Synthetic Receiver", position: "WR", team: "TST" },
    ]),
    null,
  );
});
