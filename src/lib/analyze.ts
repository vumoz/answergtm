import type { AnswerAnalysis, BrandHit, BrandSpec, Citation } from "./types";

/** Normalise a URL or bare host to a registrable-looking domain without "www.". */
export function domainOf(urlOrHost: string): string {
  let host = urlOrHost.trim().toLowerCase();
  try {
    if (!/^[a-z]+:\/\//.test(host)) host = `https://${host}`;
    host = new URL(host).hostname;
  } catch {
    // fall through with the raw string
  }
  return host.replace(/^www\./, "");
}

export function sameSite(domain: string, brandDomain: string): boolean {
  const d = domainOf(domain);
  const b = domainOf(brandDomain);
  return d === b || d.endsWith(`.${b}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index of the first whole-word, case-insensitive match of any name, or -1. */
export function firstMention(text: string, names: string[]): number {
  let best = -1;
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "iu");
    const m = re.exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const POSITIVE = [
  "best", "top", "recommended", "recommend", "excellent", "great", "trusted", "reputable",
  "high-quality", "high quality", "effective", "popular", "well-reviewed", "favorite", "favourite",
  "standout", "reliable", "clean", "transparent", "third-party tested", "award",
];
const NEGATIVE = [
  "avoid", "poor", "bad", "worst", "complaints", "complaint", "lawsuit", "recall", "scam",
  "overpriced", "expensive", "side effects", "unproven", "misleading", "warning", "not recommended",
  "lacks", "lack of", "questionable", "controversial", "fda warning",
];

function countTerms(sentence: string, terms: string[]): number {
  const s = sentence.toLowerCase();
  let n = 0;
  for (const t of terms) {
    const re = new RegExp(`(?<![a-z])${escapeRegex(t)}(?![a-z])`, "g");
    n += (s.match(re) ?? []).length;
  }
  return n;
}

/** Simple lexicon sentiment over the sentences that name the brand. */
export function brandSentiment(text: string, names: string[]): BrandHit["sentiment"] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  let pos = 0;
  let neg = 0;
  let found = false;
  for (const sentence of sentences) {
    if (firstMention(sentence, names) === -1) continue;
    found = true;
    // "not recommended" counts as negative, so do not also count "recommended" as positive.
    const negatedPositive = (sentence.toLowerCase().match(/\bnot (?:recommended|the best|effective)\b/g) ?? []).length;
    pos += countTerms(sentence, POSITIVE) - negatedPositive;
    neg += countTerms(sentence, NEGATIVE);
  }
  if (!found) return null;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

/** Find which brands an answer names, in what order, and which are cited as sources. */
export function analyzeAnswer(text: string, citations: Citation[], brands: BrandSpec[]): AnswerAnalysis {
  const firsts = brands.map((b) => ({ b, idx: firstMention(text, [b.name, ...b.aliases]) }));
  const order = firsts
    .filter((f) => f.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
    .map((f) => f.b.key);

  const citedDomains = [...new Set(citations.map((c) => c.domain).filter(Boolean))];

  const hits: BrandHit[] = firsts.map(({ b, idx }) => {
    const cited = !!b.domain && citedDomains.some((d) => sameSite(d, b.domain!));
    return {
      key: b.key,
      name: b.name,
      mentioned: idx >= 0,
      position: idx >= 0 ? order.indexOf(b.key) + 1 : null,
      cited,
      sentiment: idx >= 0 ? brandSentiment(text, [b.name, ...b.aliases]) : null,
    };
  });

  return { brands: hits, citedDomains };
}

/** Pull bare URLs out of answer text, for engines that inline sources instead of returning them. */
export function urlsInText(text: string): Citation[] {
  const urls = text.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;:]+$/, "")))].map((url) => ({ url, domain: domainOf(url) }));
}

export function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}
