import type { Citation, Engine } from "../types";

/** Deterministic PRNG so demo runs are repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SOURCES = [
  "healthline.com", "examine.com", "reddit.com", "verywellhealth.com", "webmd.com",
  "amazon.com", "youtube.com", "consumerlab.com", "nih.gov", "garagegymreviews.com",
];
const PHRASES = ["is a popular choice", "is often recommended", "gets strong reviews", "is a budget pick", "has mixed reviews and some complaints"];

/**
 * Offline engine that writes plausible-looking answers. It lets you try the
 * dashboard without API keys. Its numbers mean nothing about real AI engines.
 */
export const demo: Engine = {
  id: "demo",
  label: "Demo (simulated)",
  isConfigured: () => process.env.DEMO_ENGINE !== "off",
  async ask(prompt, opts) {
    const rand = mulberry32(hash(prompt) ^ (opts.seed ?? 0));
    const brands = opts.demoBrands ?? [];
    // The first brand in the list (the tracked brand) shows up less often, like a smaller challenger.
    const picked = brands.filter((_, i) => rand() < (i === 0 ? 0.35 : 0.6));
    picked.sort(() => rand() - 0.5);
    const lines = [`Here are some options people consider for "${prompt}":`, ""];
    picked.forEach((b, i) => lines.push(`${i + 1}. ${b.name} ${PHRASES[Math.floor(rand() * PHRASES.length)]}.`));
    if (picked.length === 0) lines.push("Look for third-party tested products and talk to your doctor before starting a supplement.");
    const citations: Citation[] = [];
    for (const d of SOURCES) if (rand() < 0.3) citations.push({ url: `https://${d}/article-${hash(prompt + d) % 1000}`, domain: d });
    for (const b of picked) if (b.domain && rand() < 0.4) citations.push({ url: `https://${b.domain}/`, domain: b.domain });
    return { text: lines.join("\n"), citations, model: "demo" };
  },
};
