import { createRequire } from "node:module";
import { test } from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import { localQualityPlugin } from "../../../scripts/local-quality-plugin.mjs";
test("real dev middleware loads valid capture and blocks disabled, nonlocal, forwarded, direct files", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-quality-boundary-")),
    original = process.env.LOCAL_QUALITY_ENABLED;
  try {
    for (const file of ["src/lib/local-quality/model.ts", "src/lib/sleeper/player-quality.ts"]) {
      const target = join(root, file);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, await readFile(file));
    }
    await mkdir(join(root, "local-data"));
    await writeFile(
      join(root, "local-data/fantasypros-quality.json"),
      '{"private":"NEVER_SERVE_THIS_RAW"}',
    );
    for (const enabled of ["0", "1"]) {
      process.env.LOCAL_QUALITY_ENABLED = enabled;
      const server = await createServer({
        root,
        configFile: false,
        envDir: false,
        publicDir: false,
        resolve: {
          alias: {
            zod: createRequire(import.meta.url)
              .resolve("zod")
              .replace(/\.cjs$/, ".js"),
          },
        },
        plugins: [localQualityPlugin({ command: "serve", mode: "development", isPreview: false })],
        server: { host: "127.0.0.1", port: 0 },
      });
      try {
        await server.listen();
        const url = `http://127.0.0.1:${server.httpServer.address().port}`;
        const data = await (await fetch(url + "/__local-quality")).json();
        assert.equal(data.status, enabled === "1" ? "invalid" : "disabled");
        for (const headers of [
          { host: "example.com" },
          { "x-forwarded-host": "example.com" },
          { origin: "https://example.com" },
        ])
          assert.ok(
            [403, 404].includes(
              await new Promise((ok, fail) => {
                const r = request(url + "/__local-quality", { headers }, (res) => {
                  res.resume();
                  ok(res.statusCode);
                });
                r.on("error", fail);
                r.end();
              }),
            ),
          );
        if (enabled === "1") {
          await writeFile(
            join(root, "local-data/fantasypros-quality.json"),
            await readFile("docs/local-quality.example.json"),
          );
          const valid = await (await fetch(url + "/__local-quality")).json();
          assert.equal(valid.status, "loaded");
          assert.equal(valid.capture.records[0].evidence.player.name, "Synthetic Receiver");
        }
        for (const path of [
          "/local-data/fantasypros-quality.json",
          "/local-data/fantasypros-quality.json?raw",
          "/@fs" + join(root, "local-data/fantasypros-quality.json"),
        ]) {
          const r = await fetch(url + path);
          assert.equal(r.status, 404);
          assert.ok(!(await r.text()).includes("NEVER_SERVE_THIS_RAW"));
        }
      } finally {
        await server.close();
      }
    }
  } finally {
    if (original === undefined) delete process.env.LOCAL_QUALITY_ENABLED;
    else process.env.LOCAL_QUALITY_ENABLED = original;
    await rm(root, { recursive: true, force: true });
  }
});
test("production decisions do not import local quality; private path is ignored", async () => {
  for (const f of [
    "src/lib/sleeper/analysis/engine.ts",
    "src/lib/sleeper/waiver-valuation.ts",
    "src/lib/sleeper/trade-analyzer.ts",
    "src/lib/sleeper/format.ts",
    "src/lib/sleeper/sleeper.server.ts",
  ])
    assert.doesNotMatch(await readFile(f, "utf8"), /local-quality|fantasypros-quality/);
  assert.match(await readFile(".gitignore", "utf8"), /^local-data\/$/m);
});
