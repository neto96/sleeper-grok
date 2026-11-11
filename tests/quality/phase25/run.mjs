import { register } from "node:module";
import { readFile } from "node:fs/promises";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { runStudy } = await import("./study.ts");
const { fixture, incomplete } = await import("./fixture.ts");
const synthetic = runStudy(incomplete(), fixture);
const localStudyAggregates = JSON.parse(
  await readFile(
    new URL("../../fixtures/phase25-local-study-aggregates.json", import.meta.url),
    "utf8",
  ),
);
if (process.argv.includes("--json"))
  process.stdout.write(JSON.stringify({ synthetic, localStudyAggregates }, null, 2) + "\n");
else {
  const { renderReport } = await import("./report.ts");
  process.stdout.write(renderReport(synthetic));
}
