import { register } from "node:module";
import { readFile, mkdir, lstat, writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { convertEcr } from "./quality-ecr.mjs";
register("../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { normalizeCapture } = await import("../src/lib/local-quality/model.ts");
try {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--all", "--qb", "--rb", "--wr", "--te", "--season", "--mappings"].includes(key) ||
      Object.hasOwn(options, key) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw Error("Invalid arguments");
    options[key] = args[i + 1];
  }
  if (!options["--all"]) throw Error("--all is required");
  const read = async (path) => {
    const raw = await readFile(resolve(path), "utf8");
    if (Buffer.byteLength(raw) > 2_000_000) throw Error("Input exceeds 2 MB");
    try {
      return JSON.parse(raw);
    } catch {
      throw Error("Malformed JSON");
    }
  };
  const inputs = [];
  for (const pool of ["ALL", "QB", "RB", "WR", "TE"])
    if (options[`--${pool.toLowerCase()}`])
      inputs.push({ pool, data: await read(options[`--${pool.toLowerCase()}`]) });
  const now = new Date().toISOString();
  const result = convertEcr(inputs, {
    now,
    season: options["--season"] === undefined ? undefined : Number(options["--season"]),
    mappings: options["--mappings"] ? await read(options["--mappings"]) : {},
  });
  const capture = normalizeCapture(result.capture, now),
    json = JSON.stringify(capture, null, 2) + "\n";
  if (Buffer.byteLength(json) > 2_000_000) throw Error("Normalized cache exceeds 2 MB");
  const dir = resolve("local-data");
  await mkdir(dir, { recursive: true });
  if ((await lstat(dir)).isSymbolicLink()) throw Error("Local directory must not be a symlink");
  const temp = resolve(dir, `quality-ecr-${process.pid}.tmp`);
  try {
    await writeFile(temp, json, { mode: 0o600, flag: "wx" });
    await rename(temp, resolve(dir, "fantasypros-quality.json"));
  } finally {
    await rm(temp, { force: true });
  }
  console.log(
    "Imported: " +
      Object.entries(result.counts)
        .map(([p, n]) => `${p} ${n}`)
        .join(" | "),
  );
  console.log(
    `Provider identities: ${result.identities}\nMapped Sleeper IDs: ${Object.keys(capture.mappings).length} (explicit supplied mappings; live validation pending)`,
  );
  console.log(
    `Rejected rows: 0 | Withheld imports: 0 | Retrieval-only records: ${result.retrievalOnly}`,
  );
  console.log(
    "Live app will resolve remaining identities from current Sleeper data. Source age and availability are checked there.",
  );
} catch (e) {
  console.error(
    `Import rejected: ${e.message}. Withheld imports: 1 (entire batch); no rows accepted. Existing cache preserved.`,
  );
  process.exitCode = 1;
}
