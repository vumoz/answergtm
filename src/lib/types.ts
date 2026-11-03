export type EngineId = "chatgpt" | "perplexity" | "gemini" | "claude" | "google_aio" | "demo";

export interface Citation {
  url: string;
  title?: string;
  domain: string;
}

export interface EngineAnswer {
  text: string;
  citations: Citation[];
  model?: string;
}

export interface Engine {
  id: EngineId;
  label: string;
  /** True when the API key (or demo flag) needed to call this engine is present. */
  isConfigured(): boolean;
  ask(prompt: string, opts: AskOptions): Promise<EngineAnswer>;
}

export interface AskOptions {
  /** ISO country code used for localised results where the engine supports it. */
  country?: string;
  /** Seed only used by the demo engine so runs are repeatable. */
  seed?: number;
  /** Brands the demo engine may mention. Real engines ignore this. */
  demoBrands?: { name: string; domain?: string | null }[];
}

/** A brand we look for in answers: the tracked brand itself or a competitor. */
export interface BrandSpec {
  key: string; // "self" for the tracked brand, otherwise "c:<id>"
  name: string;
  aliases: string[];
  domain?: string | null;
}

export interface BrandHit {
  key: string;
  name: string;
  mentioned: boolean;
  /** 1 = first brand named in the answer. Null when not mentioned. */
  position: number | null;
  /** True when one of the answer's sources is on this brand's domain. */
  cited: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
}

export interface AnswerAnalysis {
  brands: BrandHit[];
  citedDomains: string[];
}
