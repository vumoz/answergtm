import { analyzeAnswer } from "./analyze";
import { brandSpecs, createRun, finishRun, getProject, insertAnswer, listPrompts } from "./db";
import { activeEngines } from "./engines";
import type { Engine, EngineId } from "./types";

export interface RunOptions {
  projectId: number;
  /** How many times each prompt is asked on each engine. More samples = tighter ranges. */
  samples?: number;
  engines?: EngineId[];
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

/** Ask every active prompt on every engine, `samples` times, and store each answer with its analysis. */
export async function runTracking(opts: RunOptions): Promise<number> {
  const project = getProject(opts.projectId);
  if (!project) throw new Error(`Project ${opts.projectId} not found`);
  const engines: Engine[] = activeEngines(opts.engines);
  if (engines.length === 0) throw new Error("No engines are configured. Add an API key to .env or use the demo engine.");
  const prompts = listPrompts(opts.projectId, true);
  if (prompts.length === 0) throw new Error("This project has no active prompts.");

  const samples = Math.max(1, opts.samples ?? 3);
  const brands = brandSpecs(opts.projectId);
  const runId = createRun(opts.projectId, samples, engines.map((e) => e.id));

  const jobs: Array<() => Promise<void>> = [];
  for (const prompt of prompts) {
    for (const engine of engines) {
      for (let sample = 0; sample < samples; sample++) {
        jobs.push(async () => {
          const started = Date.now();
          try {
            const answer = await withRetry(() =>
              engine.ask(prompt.text, {
                country: project.country ?? undefined,
                seed: runId * 1000 + sample * 31 + engine.id.length,
                demoBrands: brands.map((b) => ({ name: b.name, domain: b.domain })),
              }),
            );
            insertAnswer({
              runId,
              promptId: prompt.id,
              engine: engine.id,
              sample,
              text: answer.text,
              citations: answer.citations,
              analysis: analyzeAnswer(answer.text, answer.citations, brands),
              model: answer.model,
              latencyMs: Date.now() - started,
            });
          } catch (e) {
            insertAnswer({
              runId,
              promptId: prompt.id,
              engine: engine.id,
              sample,
              text: "",
              citations: [],
              analysis: null,
              error: e instanceof Error ? e.message : String(e),
              latencyMs: Date.now() - started,
            });
          }
        });
      }
    }
  }

  let done = 0;
  const total = jobs.length;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (next < total) {
      const job = jobs[next++];
      await job();
      opts.onProgress?.(++done, total);
    }
  });
  try {
    await Promise.all(workers);
    finishRun(runId, "done");
  } catch (e) {
    finishRun(runId, "failed");
    throw e;
  }
  return runId;
}
