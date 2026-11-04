/**
 * Run a tracking round from the command line.
 *   npm run track -- --project 1 --samples 3 --engines chatgpt,perplexity
 */
import "./env";
import { listProjects } from "../src/lib/db";
import { runTracking } from "../src/lib/runner";
import { buildReport } from "../src/lib/report";
import { pct } from "../src/lib/stats";
import type { EngineId } from "../src/lib/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const projectId = Number(arg("project") ?? listProjects()[0]?.id);
if (!projectId) {
  console.error("No project found. Run `npm run seed` first.");
  process.exit(1);
}
const samples = Number(arg("samples") ?? 3);
const engines = arg("engines")?.split(",") as EngineId[] | undefined;

async function main() {
const runId = await runTracking({
  projectId,
  samples,
  engines,
  onProgress: (done, total) => process.stdout.write(`\r${done}/${total} answers`),
});
process.stdout.write("\n");

const r = buildReport(projectId, runId)!;
console.log(`Run ${runId}: brand named in ${pct(r.overall.rate)} of ${r.validAnswers} answers (95% range ${pct(r.overall.low)} to ${pct(r.overall.high)}).`);
if (r.errors) console.log(`${r.errors} answers failed; see the dashboard for the error messages.`);
for (const e of r.engines) console.log(`  ${e.engine}: ${pct(e.mention.rate)} (${pct(e.mention.low)} to ${pct(e.mention.high)})`);
if (r.change) {
  const word = r.change.significant ? "a real change" : "within normal variation";
  console.log(`Change since run ${r.previousRun!.id}: ${r.change.delta >= 0 ? "+" : ""}${(r.change.delta * 100).toFixed(1)} points, ${word}.`);
}
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
