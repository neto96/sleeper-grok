import { test } from "node:test";
import assert from "node:assert/strict";
import { convertEcr } from "../../../scripts/quality-ecr.mjs";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const now = "2026-11-17T12:00:00.000Z";
const raw = () => ({
  season: 2026,
  ranking_type: "ROS",
  scoring: "PPR",
  data_as_of: { date: "2026-11-16" },
  rankings: [
    {
      player_id: 901,
      player_name: "Synthetic Receiver",
      position: "WR",
      team: "TST",
      rank_ecr: 50,
      pos_rank: "WR20",
    },
  ],
});
const run = (data) => convertEcr([{ pool: "ALL", data }], { now });
test("ALL only preserves provenance, annotation and unresolved identity without mutation", () => {
  const data = raw(),
    before = JSON.stringify(data),
    r = run(data),
    e = r.capture.records[0].evidence;
  assert.equal(JSON.stringify(data), before);
  assert.equal(e.overallEcr, 50);
  assert.equal(e.positionalEcr, 20);
  assert.equal(e.pool.kind, "overall");
  assert.equal(e.player.sleeperId, null);
  assert.equal(e.player.identityResolved, false);
  assert.equal(e.sourceAsOfDate, "2026-11-16");
  assert.equal(e.sourceUpdatedAt, null);
  assert.equal(e.retrievedAt, now);
  assert.equal(r.identities, 1);
  assert.deepEqual(r.counts, { ALL: 1 });
});
test("all five pools remain independent, including disagreeing ALL annotation", () => {
  const inputs = [{ pool: "ALL", data: raw() }];
  for (const [i, p] of ["QB", "RB", "WR", "TE"].entries()) {
    const data = raw();
    data.rankings[0] = {
      ...data.rankings[0],
      player_id: p === "WR" ? 901 : 902 + i,
      player_name: p === "WR" ? "Synthetic Receiver" : `Synthetic ${p}`,
      position: p,
      rank_ecr: 12,
      pos_rank: `${p}12`,
    };
    inputs.push({ pool: p, data });
  }
  const r = convertEcr(inputs, { now });
  assert.equal(r.capture.records.length, 5);
  assert.equal(r.identities, 4);
  for (const e of r.capture.records.slice(1).map((r) => r.evidence)) {
    assert.equal(e.overallEcr, null);
    assert.equal(e.positionalEcr, 12);
    assert.equal(e.pool.kind, "position");
    assert.ok(e.pool.id.endsWith(e.pool.position));
  }
  assert.equal(r.capture.records[0].evidence.positionalEcr, 20);
});
test("invalid or absent source date is explicitly retrieval only; stale source is retained", () => {
  for (const date of [undefined, "not-a-date", "2026-02-30"]) {
    const data = raw();
    data.data_as_of = { date };
    const r = run(data);
    assert.equal(r.retrievalOnly, 1);
    assert.equal(r.capture.records[0].evidence.sourceAsOfDate, null);
  }
  const data = raw();
  data.data_as_of.date = "2026-01-01";
  assert.equal(run(data).capture.records[0].evidence.sourceAsOfDate, "2026-01-01");
  data.data_as_of.date = "2026-11-18";
  assert.throws(() => run(data), /future/);
});
test("season missing requires explicit confirmation; wrong seasons rejected", () => {
  const data = raw();
  delete data.season;
  assert.throws(() => run(data), /season missing/);
  assert.equal(
    convertEcr([{ pool: "ALL", data }], { now, season: 2026 }).capture.records[0].evidence.season,
    2026,
  );
  data.season = 2025;
  assert.throws(() => convertEcr([{ pool: "ALL", data }], { now, season: 2026 }), /season/);
  data.season = "2026";
  assert.throws(() => run(data), /season/);
});
test("malformed, wrong scope, conflicting metadata and rows fail closed", () => {
  for (const mutate of [
    (d) => d.rankings.push({ ...d.rankings[0] }),
    (d) => (d.rankings[0].rank_ecr = 0),
    (d) => (d.rankings[0].rank_ecr = "1"),
    (d) => (d.rankings[0].rank_ecr = Infinity),
    (d) => (d.rankings[0].position = "K"),
    (d) => delete d.rankings[0].team,
    (d) => (d.rankings[0].pos_rank = "RB2"),
    (d) => (d.rankings[0].player_id = {}),
    (d) => (d.ranking_type = "WEEKLY"),
    (d) => (d.scoring = "HALF"),
    (d) => (d.pool = "WR"),
    (d) => (d.metadata = { season: 2025 }),
    (d) => (d.format = "superflex"),
    (d) => (d.rankings = [null]),
    (d) => (d.data_as_of = "2026-11-16"),
    (d) => (d.rankings = []),
  ]) {
    const data = raw();
    mutate(data);
    assert.throws(() => run(data));
  }
  assert.throws(() => run(null));
  assert.throws(() => convertEcr([{ pool: "WR", data: raw() }], { now }));
  const wr = raw();
  wr.rankings[0].player_name = "Different Receiver";
  wr.rankings[0].pos_rank = 50;
  assert.throws(
    () =>
      convertEcr(
        [
          { pool: "ALL", data: raw() },
          { pool: "WR", data: wr },
        ],
        { now },
      ),
    /identity/,
  );
});
test("explicit mappings preserved, no invented IDs or unknown mappings", () => {
  const r = convertEcr([{ pool: "ALL", data: raw() }], {
    now,
    mappings: { 901: "explicit-sleeper" },
  });
  assert.deepEqual(r.capture.mappings, { 901: "explicit-sleeper" });
  assert.equal(r.capture.records[0].evidence.player.sleeperId, null);
  assert.throws(
    () => convertEcr([{ pool: "ALL", data: raw() }], { now, mappings: { 999: "other" } }),
    /absent/,
  );
});
test("CLI commits entire valid batch atomically and keeps old cache on every invalid input", async () => {
  const root = await mkdtemp(join(tmpdir(), "raw-quality-")),
    script = resolve("scripts/quality-import-ecr.mjs");
  const invoke = (args) =>
    spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  try {
    const data = raw();
    data.season = new Date().getUTCFullYear();
    data.data_as_of = {};
    await writeFile(join(root, "all.json"), JSON.stringify(data));
    const result = invoke(["--all", "all.json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ALL 1/);
    assert.match(result.stdout, /Mapped Sleeper IDs: 0/);
    const path = join(root, "local-data/fantasypros-quality.json"),
      saved = await readFile(path, "utf8");
    assert.ok(
      Math.abs(Date.now() - Date.parse(JSON.parse(saved).records[0].evidence.retrievedAt)) < 10000,
    );
    await writeFile(join(root, "bad.json"), "{broken");
    for (const args of [
      ["--all", "bad.json"],
      ["--all", "all.json", "--wr", "bad.json"],
      ["--all", "all.json", "--all", "all.json"],
      ["--wr", "all.json"],
    ]) {
      const r = invoke(args);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Existing cache preserved/);
      assert.equal(await readFile(path, "utf8"), saved);
    }
    assert.deepEqual(await readdir(join(root, "local-data")), ["fantasypros-quality.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("runtime sources never import raw tooling; private raw paths are ignored", async () => {
  const result = spawnSync(
    "git",
    ["grep", "-n", "-E", "quality-ecr|quality-import-ecr", "--", "src", "vite.config.ts"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1, result.stdout);
  assert.equal(
    spawnSync("git", ["check-ignore", "local-data/raw/all.json"], { encoding: "utf8" }).status,
    0,
  );
});

test("nested source season and year aliases cannot be overridden", () => {
  for (const field of ["season", "year"])
    for (const level of ["root", "metadata", "data_as_of"]) {
      const data = raw();
      delete data.season;
      const target = level === "root" ? data : (data[level] ??= {});
      target[field] = 2026;
      assert.equal(run(data).capture.records[0].evidence.season, 2026);
      target[field] = 2025;
      assert.throws(() => convertEcr([{ pool: "ALL", data }], { now, season: 2026 }), /season/);
    }
  const data = raw();
  data.sport = "MLB";
  assert.throws(() => run(data), /sport/);
});
