import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
test("helper only writes normalized local cache and preserves it on invalid input", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-import-")),
    script = resolve("scripts/quality-import.mjs");
  try {
    const input = join(root, "input.json"),
      c = JSON.parse(await readFile("docs/local-quality.example.json", "utf8"));
    c.unrelated = "must be stripped";
    await writeFile(input, JSON.stringify(c));
    const run = () =>
      spawnSync(process.execPath, ["--experimental-strip-types", script, input], {
        cwd: root,
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    const output = join(root, "local-data/fantasypros-quality.json"),
      saved = await readFile(output, "utf8");
    assert.ok(!saved.includes("must be stripped"));
    assert.equal(JSON.parse(saved).records.length, 1);
    await writeFile(input, "{malformed");
    assert.equal(run().status, 1);
    assert.equal(await readFile(output, "utf8"), saved);
    assert.deepEqual((await readdir(root)).sort(), ["input.json", "local-data"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
