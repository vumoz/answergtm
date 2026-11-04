import { describe, expect, it } from "vitest";
import { runAudit, type Fetcher } from "../src/lib/audit";
import { isAllowed, parseRobots } from "../src/lib/audit/robots";
import { analyzePage } from "../src/lib/audit/page";

describe("robots", () => {
  const r = parseRobots(`User-agent: *\nDisallow: /cart\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /\n\nSitemap: https://x.com/sitemap.xml`);
  it("applies the most specific group and longest rule", () => {
    expect(isAllowed(r, "GPTBot")).toBe(false);
    expect(isAllowed(r, "perplexitybot")).toBe(false);
    expect(isAllowed(r, "ClaudeBot")).toBe(true);
    expect(isAllowed(r, "ClaudeBot", "/cart/x")).toBe(false);
    expect(r.sitemaps).toEqual(["https://x.com/sitemap.xml"]);
  });
  it("treats an empty Disallow as allow-all", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), "GPTBot")).toBe(true);
  });
});

describe("analyzePage", () => {
  it("reads schema, headings and text without running scripts", () => {
    const html = `<html><head><title>Bloom</title><meta name="description" content="Liver support">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"B"},{"@type":"Product","name":"Bloom","offers":{"@type":"Offer","price":"39","availability":"InStock"}}]}</script>
      </head><body><h1>Bloom</h1><h2>Is it safe?</h2><p>150 mg milk thistle <a href="https://pubmed.ncbi.nlm.nih.gov/1">study</a></p><script>var a = "lots of hidden words here"</script></body></html>`;
    const p = analyzePage("https://b.com/products/bloom", 200, html);
    expect(p.schemaTypes.sort()).toEqual(["Organization", "Product"]);
    expect(p.product).toMatchObject({ name: true, price: true, availability: true, aggregateRating: false });
    expect(p.questionHeadings).toBe(1);
    expect(p.hasNumbers).toBe(true);
    expect(p.externalLinks).toBe(1);
    expect(p.wordCount).toBeLessThan(20);
  });
});

function site(files: Record<string, string>): Fetcher {
  return async (url) => {
    const u = new URL(url);
    const key = u.pathname + (u.search || "");
    return key in files ? { status: 200, text: files[key] } : { status: 404, text: "" };
  };
}

const thinProduct = `<html><head><title>Bloom</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("runAudit", () => {
  it("finds blocked bots, thin pages, missing schema and short product descriptions", async () => {
    const r = await runAudit("bloom.test", {
      fetcher: site({
        "/robots.txt": "User-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://bloom.test/sitemap.xml",
        "/sitemap.xml": `<sitemapindex><sitemap><loc>https://bloom.test/sitemap_pages.xml</loc></sitemap><sitemap><loc>https://bloom.test/sitemap_products.xml</loc></sitemap></sitemapindex>`,
        "/sitemap_products.xml": "<urlset><url><loc>https://bloom.test/products/bloom</loc></url></urlset>",
        "/sitemap_pages.xml": "<urlset><url><loc>https://bloom.test/pages/about</loc></url></urlset>",
        "/": `<html><head><title>Home</title><meta name="description" content="x"></head><body><h1>Bloom</h1><p>${words(300)}</p></body></html>`,
        "/products/bloom": thinProduct,
        "/pages/about": `<html><body><p>${words(200)}</p></body></html>`,
        "/products.json?limit=50": JSON.stringify({ products: [{ title: "Bloom", handle: "bloom", body_html: "<p>Short.</p>", variants: [{ price: "39.00" }] }] }),
      }),
    });
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    expect(byId["ai-search-bots"].status).toBe("fail");
    expect(byId["ai-search-bots"].detail).toContain("PerplexityBot");
    expect(byId["readable-text"].status).toBe("fail");
    expect(byId["readable-text"].pages).toEqual(["https://bloom.test/products/bloom"]);
    expect(byId["product-schema"].status).toBe("fail");
    expect(byId["ratings-schema"].status).toBe("warn");
    expect(byId["faq"].status).toBe("fail");
    expect(byId["llms-txt"].status).toBe("warn");
    expect(byId["product-descriptions"].status).toBe("warn");
    expect(r.products[0]).toMatchObject({ title: "Bloom", price: "39.00", url: "https://bloom.test/products/bloom" });
    expect(r.checks[0].status).toBe("fail");
    expect(r.score).toBeLessThan(60);
  });

  it("scores a well-prepared site highly", async () => {
    const product = `<html><head><title>Bloom</title><meta name="description" content="x">
      <script type="application/ld+json">{"@type":"Product","name":"Bloom","description":"d","image":"i","brand":"B","offers":{"price":"39","availability":"InStock"},"aggregateRating":{"ratingValue":"4.8"}}</script>
      <script type="application/ld+json">{"@type":"Organization","name":"B"}</script></head>
      <body><h2>Who is it for?</h2><h2>How do I take it?</h2><h2>Is it tested?</h2><p>150 mg per serving. <a href="https://pubmed.ncbi.nlm.nih.gov/1">Study</a> ${words(200)}</p></body></html>`;
    const r = await runAudit("https://good.test", {
      fetcher: site({
        "/robots.txt": "User-agent: *\nAllow: /",
        "/llms.txt": "# Good",
        "/sitemap.xml": "<urlset><url><loc>https://good.test/products/bloom</loc></url></urlset>",
        "/": product,
        "/products/bloom": product,
      }),
    });
    expect(r.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});
