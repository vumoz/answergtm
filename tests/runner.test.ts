import { beforeEach, describe, expect, it } from "vitest";
import { addCompetitor, addPrompt, createProject, listAnswers, resetDb } from "../src/lib/db";
import { runTracking } from "../src/lib/runner";
import { buildReport } from "../src/lib/report";

beforeEach(() => {
  process.env.DATABASE_PATH = ":memory:";
  resetDb();
});

describe("runTracking with the demo engine", () => {
  it("stores samples x prompts answers and builds a report", async () => {
    const id = createProject({ name: "Test", brandName: "BioNature Bloom", brandDomain: "bionaturebloom.com" });
    addCompetitor(id, { name: "Thorne", domain: "thorne.com" });
    addPrompt(id, "best liver supplement");
    addPrompt(id, "best joint supplement");

    const runId = await runTracking({ projectId: id, samples: 4, engines: ["demo"] });
    expect(listAnswers(runId)).toHaveLength(8);

    const r = buildReport(id, runId)!;
    expect(r.validAnswers).toBe(8);
    expect(r.engines.map((e) => e.engine)).toEqual(["demo"]);
    expect(r.overall.low).toBeLessThanOrEqual(r.overall.rate);
    expect(r.overall.high).toBeGreaterThanOrEqual(r.overall.rate);
    expect(r.brands.map((b) => b.name).sort()).toEqual(["BioNature Bloom", "Thorne"]);
    expect(r.prompts).toHaveLength(2);
  });

  it("compares a run with the one before it", async () => {
    const id = createProject({ name: "Test", brandName: "Brand" });
    addPrompt(id, "q");
    await runTracking({ projectId: id, samples: 2, engines: ["demo"] });
    const second = await runTracking({ projectId: id, samples: 2, engines: ["demo"] });
    const r = buildReport(id, second)!;
    expect(r.previousRun).not.toBeNull();
    expect(r.change).not.toBeNull();
  });
});
