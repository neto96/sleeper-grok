import { register } from "node:module";
import { readFile, mkdir, writeFile, rename, rm, lstat } from "node:fs/promises";
import { resolve } from "node:path";
register("../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { normalizeCapture, mappingSummary } = await import("../src/lib/local-quality/model.ts");
const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run quality:import -- <capture.json>");
  process.exitCode = 1;
} else
  try {
    const raw = await readFile(resolve(input), "utf8");
    if (Buffer.byteLength(raw) > 2_000_000) throw Error("too large");
    const capture = normalizeCapture(JSON.parse(raw)),
      dir = resolve("local-data");
    await mkdir(dir, { recursive: true });
    if ((await lstat(dir)).isSymbolicLink()) throw Error("symlink");
    const temp = resolve(dir, `quality-${process.pid}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(capture, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      await rename(temp, resolve(dir, "fantasypros-quality.json"));
    } finally {
      await rm(temp, { force: true });
    }
    console.log("Local capture imported:", JSON.stringify(mappingSummary(capture)));
    console.log(
      "Counts use the supplied player catalogue; current waiver membership is checked in the app. No provider calls or Git actions.",
    );
  } catch {
    console.error(
      "Import rejected. Check documented schema, file size and local-data directory. Existing cache preserved.",
    );
    process.exitCode = 1;
  }
