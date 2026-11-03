import type { Engine, EngineId } from "../types";
import { chatgpt } from "./openai";
import { perplexity } from "./perplexity";
import { gemini } from "./gemini";
import { googleAio } from "./google-aio";
import { claude } from "./claude";
import { demo } from "./demo";

export const ALL_ENGINES: Engine[] = [chatgpt, perplexity, gemini, googleAio, claude, demo];

export function engineById(id: string): Engine | undefined {
  return ALL_ENGINES.find((e) => e.id === id);
}

/** Real engines with keys set. Falls back to the demo engine when none are configured. */
export function activeEngines(ids?: EngineId[]): Engine[] {
  if (ids?.length) return ids.map((id) => engineById(id)).filter((e): e is Engine => !!e && e.isConfigured());
  const real = ALL_ENGINES.filter((e) => e.id !== "demo" && e.isConfigured());
  return real.length ? real : [demo];
}
