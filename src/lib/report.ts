import { brandSpecs, getRun, listAnswers, listPrompts, listRuns, type AnswerRow, type Run } from "./db";
import { compareRates, mean, wilson, type Change, type Rate } from "./stats";
import type { BrandSpec } from "./types";
import { sameSite } from "./analyze";

export interface EngineStats {
  engine: string;
  answers: number;
  errors: number;
  mention: Rate;
  cited: Rate;
  avgPosition: number | null;
  sentiment: { positive: number; neutral: number; negative: number };
}

export interface BrandStats {
  key: string;
  name: string;
  isSelf: boolean;
  mention: Rate;
  shareOfVoice: number;
  avgPosition: number | null;
}

export interface PromptStats {
  promptId: number;
  text: string;
  topic: string | null;
  mention: Rate;
  byEngine: Record<string, Rate>;
  /** Competitors that appeared in answers to this prompt, most frequent first. */
  competitorsSeen: { name: string; count: number }[];
  topDomains: { domain: string; count: number }[];
}

export interface SourceGap {
  domain: string;
  /** Answers citing this domain where a competitor was named and the tracked brand was not. */
  gapAnswers: number;
  totalAnswers: number;
}

export interface Report {
  run: Run;
  previousRun: Run | null;
  validAnswers: number;
  errors: number;
  overall: Rate;
  change: Change | null;
  engines: EngineStats[];
  brands: BrandStats[];
  prompts: PromptStats[];
  sourceGaps: SourceGap[];
  topDomains: { domain: string; count: number }[];
}

function hitFor(a: AnswerRow, key: string) {
  return a.analysis?.brands.find((b) => b.key === key);
}

function countTop<T extends string>(items: T[], limit: number) {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function selfRate(answers: AnswerRow[]): Rate {
  const valid = answers.filter((a) => a.analysis);
  return wilson(valid.filter((a) => hitFor(a, "self")?.mentioned).length, valid.length);
}

/** Build the dashboard numbers for one run, compared with the run before it. */
export function buildReport(projectId: number, runId?: number): Report | null {
  const runs = listRuns(projectId).filter((r) => r.status === "done");
  const run = runId ? getRun(runId) : runs[0];
  if (!run) return null;
  const previousRun = runs.find((r) => r.id < run.id) ?? null;

  const all = listAnswers(run.id);
  const answers = all.filter((a) => a.analysis);
  const brands: BrandSpec[] = brandSpecs(projectId);
  const prompts = listPrompts(projectId);

  const overall = selfRate(answers);
  const change = previousRun ? compareRates(selfRate(listAnswers(previousRun.id)), overall) : null;

  const engines: EngineStats[] = run.engines.map((engine) => {
    const ea = all.filter((a) => a.engine === engine);
    const ok = ea.filter((a) => a.analysis);
    const selfHits = ok.map((a) => hitFor(a, "self")!).filter(Boolean);
    const mentioned = selfHits.filter((h) => h.mentioned);
    return {
      engine,
      answers: ok.length,
      errors: ea.length - ok.length,
      mention: wilson(mentioned.length, ok.length),
      cited: wilson(selfHits.filter((h) => h.cited).length, ok.length),
      avgPosition: mean(mentioned.map((h) => h.position!).filter((p) => p != null)),
      sentiment: {
        positive: mentioned.filter((h) => h.sentiment === "positive").length,
        neutral: mentioned.filter((h) => h.sentiment === "neutral").length,
        negative: mentioned.filter((h) => h.sentiment === "negative").length,
      },
    };
  });

  const totalMentions = answers.reduce((n, a) => n + (a.analysis?.brands.filter((b) => b.mentioned).length ?? 0), 0);
  const brandStats: BrandStats[] = brands
    .map((b) => {
      const hits = answers.map((a) => hitFor(a, b.key)).filter((h) => h?.mentioned);
      return {
        key: b.key,
        name: b.name,
        isSelf: b.key === "self",
        mention: wilson(hits.length, answers.length),
        shareOfVoice: totalMentions ? hits.length / totalMentions : 0,
        avgPosition: mean(hits.map((h) => h!.position!).filter((p) => p != null)),
      };
    })
    .sort((a, b) => b.mention.rate - a.mention.rate);

  const promptStats: PromptStats[] = prompts
    .map((p) => {
      const pa = answers.filter((a) => a.prompt_id === p.id);
      if (pa.length === 0) return null;
      const byEngine: Record<string, Rate> = {};
      for (const e of run.engines) byEngine[e] = selfRate(pa.filter((a) => a.engine === e));
      const compNames = pa.flatMap((a) => a.analysis!.brands.filter((b) => b.key !== "self" && b.mentioned).map((b) => b.name));
      return {
        promptId: p.id,
        text: p.text,
        topic: p.topic,
        mention: selfRate(pa),
        byEngine,
        competitorsSeen: countTop(compNames, 5).map(([name, count]) => ({ name, count })),
        topDomains: countTop(pa.flatMap((a) => a.analysis!.citedDomains), 5).map(([domain, count]) => ({ domain, count })),
      };
    })
    .filter((p): p is PromptStats => !!p)
    .sort((a, b) => a.mention.rate - b.mention.rate);

  const domainTotals = new Map<string, { gap: number; total: number }>();
  for (const a of answers) {
    const selfMentioned = !!hitFor(a, "self")?.mentioned;
    const rivalMentioned = a.analysis!.brands.some((b) => b.key !== "self" && b.mentioned);
    for (const d of a.analysis!.citedDomains) {
      const t = domainTotals.get(d) ?? { gap: 0, total: 0 };
      t.total++;
      if (!selfMentioned && rivalMentioned) t.gap++;
      domainTotals.set(d, t);
    }
  }
  // Brand-owned sites are not outreach targets, so leave them out of the gap list.
  const brandDomains = brands.map((b) => b.domain).filter((d): d is string => !!d);
  const sourceGaps = [...domainTotals.entries()]
    .filter(([d, t]) => t.gap > 0 && !brandDomains.some((b) => sameSite(d, b)))
    .map(([domain, t]) => ({ domain, gapAnswers: t.gap, totalAnswers: t.total }))
    .sort((a, b) => b.gapAnswers - a.gapAnswers)
    .slice(0, 10);

  return {
    run,
    previousRun,
    validAnswers: answers.length,
    errors: all.length - answers.length,
    overall,
    change,
    engines,
    brands: brandStats,
    prompts: promptStats,
    sourceGaps,
    topDomains: countTop(answers.flatMap((a) => a.analysis!.citedDomains), 10).map(([domain, count]) => ({ domain, count })),
  };
}
