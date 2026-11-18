/** Integration check: builds with a synthetic private cache, restoring it afterward. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm, readdir, mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
const path = resolve("local-data/fantasypros-quality.json"),
  sentinel = "PHASE3A_PRIVATE_BUILD_CANARY_82943";
let original = null;
let rawDir = null;
try {
  original = await readFile(path);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
      ),
    )
  ).flat();
try {
  await mkdir(resolve("local-data"), { recursive: true });
  rawDir = await mkdtemp(resolve("local-data/raw-build-check-"));
  await writeFile(
    join(rawDir, "all.json"),
    JSON.stringify({ rankings: [{ player_name: "PHASE3B_RAW_PRIVATE_CANARY_63819" }] }),
    { mode: 0o600 },
  );
  const c = JSON.parse(await readFile("docs/local-quality.example.json", "utf8"));
  c.records[0].evidence.player.name = sentinel;
  await writeFile(path, JSON.stringify(c), { mode: 0o600 });
  for (const command of ["build", "build:dev"]) {
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command], {
      env: { ...process.env, LOCAL_QUALITY_ENABLED: "1", FANTASYPROS_API_KEY: "BUNDLED_SECRET_CANARY_46321" },
      encoding: "utf8",
      maxBuffer: 20_000_000,
    });
    await mkdir("test-results", { recursive: true });
    await writeFile(
      `test-results/phase3a-${command.replace(":", "-")}-private.log`,
      r.stdout + r.stderr,
    );
    assert.equal(r.status, 0, `${command} failed; inspect local log`);
    const files = await walk(".vercel/output");
    assert.ok(files.length > 10);
    let combined = "";
    for (const f of files) {
      const data = await readFile(f);
      combined += data.toString();
      for (const marker of [
        sentinel,
        "BUNDLED_SECRET_CANARY_46321",
        "PHASE3B_RAW_PRIVATE_CANARY_63819",
        "quality-import-ecr",
        "Expected current calendar season",
        "/__local-quality",
      ])
        assert.ok(
          !data.includes(Buffer.from(marker)),
          `${f} contains development marker ${marker}`,
        );
    }
    for (const marker of ["Best ROS Assets", "Fixed Week 11 capture", "2026-11-17", "Jahmyr Gibbs"])
      assert.ok(combined.includes(marker), `Missing bundled ROS production marker ${marker}`);
    console.log(
      `PASS ${command}: ${files.length} built files include approved bundled ROS; exclude private local data and endpoint`,
    );
  }
} finally {
  if (rawDir) await rm(rawDir, { recursive: true, force: true });
  if (original !== null) await writeFile(path, original);
  else await rm(path, { force: true });
}
