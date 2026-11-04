import { beforeEach, describe, expect, it } from "vitest";
import { draftContent, faqSchema, llmsTxt, productSchema, robotsFix } from "../src/lib/fixes";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
});

describe("code fixes", () => {
  it("allows every AI search crawler", () => {
    const t = robotsFix();
    for (const bot of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Googlebot", "Bingbot"]) expect(t).toContain(`User-agent: ${bot}`);
  });
  it("builds valid Product and FAQ JSON-LD", () => {
    const p = productSchema({ title: "Bloom", handle: "bloom", description: "Liver support", price: "39.00", url: "https://b.com/products/bloom" }, "BioNature Bloom");
    const obj = JSON.parse(p.replace(/<\/?script[^>]*>/g, "").replace(/^\s*\/\/.*$/gm, ""));
    expect(obj).toMatchObject({ "@type": "Product", name: "Bloom", offers: { price: "39.00", priceCurrency: "USD" } });
    const f = JSON.parse(faqSchema([{ q: "Q?", a: "A." }]).replace(/<\/?script[^>]*>/g, ""));
    expect(f.mainEntity[0]).toMatchObject({ name: "Q?", acceptedAnswer: { text: "A." } });
  });
  it("writes llms.txt with products", () => {
    const t = llmsTxt({ brand: "B", site: "https://b.com", summary: "Supplements.", products: [{ title: "Bloom", handle: "bloom", description: "Supports liver. More.", url: "https://b.com/products/bloom" }] });
    expect(t).toContain("# B");
    expect(t).toContain("- [Bloom](https://b.com/products/bloom): Supports liver");
  });
});

describe("draftContent without an API key", () => {
  it("returns a compliant template with one heading per question", async () => {
    const d = await draftContent({ kind: "faq", brand: "BioNature Bloom", facts: "", questions: ["What is the best liver support supplement?", "Is it safe?"] });
    expect(d.generatedBy).toBe("template");
    expect(d.content.match(/^### /gm)).toHaveLength(2);
    expect(d.compliance.verdict).toBe("ok");
  });
});
