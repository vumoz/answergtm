import Anthropic from "@anthropic-ai/sdk";
import { AI_BOTS } from "./audit/robots";
import type { ShopifyProduct } from "./audit";
import { checkClaims, DSHEA_DISCLAIMER, type ComplianceResult } from "./compliance";

/** Ready-to-paste fixes. Code fixes are deterministic; written content uses Claude when a key is set. */

export function robotsFix(): string {
  const lines = ["# Let AI search engines read and cite the site"];
  for (const b of AI_BOTS.filter((b) => b.role === "search")) lines.push(`User-agent: ${b.agent}`, "Allow: /", "");
  return lines.join("\n").trim();
}

export function llmsTxt(o: { brand: string; site: string; summary: string; products: ShopifyProduct[]; pages?: { title: string; url: string }[] }): string {
  const out = [`# ${o.brand}`, "", `> ${o.summary}`, ""];
  if (o.products.length) {
    out.push("## Products", "");
    for (const p of o.products.slice(0, 30)) out.push(`- [${p.title}](${p.url})${p.description ? `: ${p.description.split(". ")[0].slice(0, 160)}` : ""}`);
    out.push("");
  }
  out.push("## Key pages", "", `- [Home](${o.site}/)`);
  for (const p of o.pages ?? []) out.push(`- [${p.title}](${p.url})`);
  return out.join("\n");
}

const script = (obj: unknown) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;

export function orgSchema(o: { brand: string; site: string; logo?: string; sameAs?: string[] }): string {
  return script({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: o.brand,
    url: o.site,
    ...(o.logo ? { logo: o.logo } : {}),
    ...(o.sameAs?.length ? { sameAs: o.sameAs } : {}),
  });
}

export function productSchema(p: ShopifyProduct, brand: string, currency = "USD"): string {
  return script({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description.slice(0, 5000),
    ...(p.image ? { image: p.image } : {}),
    brand: { "@type": "Brand", name: p.vendor || brand },
    url: p.url,
    offers: {
      "@type": "Offer",
      url: p.url,
      priceCurrency: currency,
      ...(p.price ? { price: p.price } : {}),
      availability: p.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
    // Add aggregateRating from your review app, e.g.:
    // "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "reviewCount": "128" }
  });
}

export function faqSchema(qas: { q: string; a: string }[]): string {
  return script({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
}

// Written content ------------------------------------------------------------

export interface DraftInput {
  kind: "faq" | "product-copy";
  brand: string;
  /** Facts the brand stands behind: ingredients, amounts, sourcing, testing, guarantees. */
  facts: string;
  /** Buyer questions to answer, usually the prompts where the brand is weakest. */
  questions: string[];
  productName?: string;
}

export interface Draft {
  content: string;
  compliance: ComplianceResult;
  generatedBy: "claude" | "template";
}

const SYSTEM = `You write web copy for a dietary supplement brand so that AI answer engines (ChatGPT, Perplexity, Gemini, Google AI Overviews, Claude) can quote it accurately.

Writing rules:
- Answer each question directly in the first sentence, then add specifics.
- Use concrete facts from the brief: ingredient names, amounts per serving, testing, sourcing. Never invent facts, numbers, studies, reviews or certifications. If a needed fact is missing, write [ADD: what is needed].
- Plain, warm, confident language. Short paragraphs. No hype.

Compliance rules (US FTC and FDA/DSHEA), which are mandatory:
- Never say the product cures, treats, heals, prevents, reverses or fights any disease or condition, and never name a disease as something it helps.
- Only structure-function wording tied to normal function: "supports healthy liver function", "promotes comfortable digestion", "helps maintain joint comfort".
- No "FDA approved", "clinically proven", "guaranteed", "miracle", "no side effects", "detox" or "flush toxins".
- Never suggest replacing medication. Recommend talking to a doctor when pregnant, nursing, or taking medication.
- End with this exact disclaimer: "${DSHEA_DISCLAIMER}"

Output Markdown only, with no preamble.`;

function brief(d: DraftInput): string {
  const what =
    d.kind === "faq"
      ? `Write an FAQ section for ${d.brand}. Use each question below as a "### " heading, rewording it to sound natural on the brand's site, and answer it in 60 to 120 words.`
      : `Write a product page description for ${d.productName ?? d.brand} by ${d.brand}: a 2-sentence summary, "Who it's for", "What's inside" (ingredients with amounts), "How to take it", and a short FAQ answering the questions below.`;
  return `${what}\n\nBrand facts:\n${d.facts || "(none given)"}\n\nBuyer questions:\n${d.questions.map((q) => `- ${q}`).join("\n")}`;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

function template(d: DraftInput): string {
  const lines = [d.kind === "faq" ? `## Frequently asked questions about ${d.brand}` : `## ${d.productName ?? d.brand}`, ""];
  for (const q of d.questions) {
    lines.push(`### ${q}`, "", `[ADD: a direct one-sentence answer, then the specific facts (ingredients, amounts, testing) that back it up.]`, "");
  }
  lines.push(DSHEA_DISCLAIMER);
  return lines.join("\n");
}

/** Draft copy, check it against the claim rules, and give Claude one chance to fix any problems. */
export async function draftContent(d: DraftInput): Promise<Draft> {
  if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    const content = template(d);
    return { content, compliance: checkClaims(content), generatedBy: "template" };
  }
  const client = new Anthropic();
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: brief(d) }];
  let msg = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM, messages });
  let content = textOf(msg);
  let compliance = checkClaims(content);
  if (compliance.issues.length) {
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content: `A claim checker flagged these problems. Rewrite the full text to fix them, keeping everything else:\n${compliance.issues
        .map((i) => `- ${i.rule}${i.match ? `: "${i.match}"` : ""}. ${i.suggestion}`)
        .join("\n")}`,
    });
    msg = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM, messages });
    content = textOf(msg);
    compliance = checkClaims(content);
  }
  return { content, compliance, generatedBy: "claude" };
}
