import { register } from "node:module";
import { readFile } from "node:fs/promises";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { renderDecisionReport } = await import("./report.ts");
const f = JSON.parse(
  await readFile(new URL("../../fixtures/shadow-quality-week10.json", import.meta.url), "utf8"),
);
process.stdout.write(renderDecisionReport(f));
