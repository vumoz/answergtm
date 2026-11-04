import { analyzePage, type PageFacts } from "./page";
import { AI_BOTS, isAllowed, parseRobots, type Robots } from "./robots";

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

export type FixKind = "robots" | "llms" | "org-schema" | "product-schema" | "faq" | "product-copy";

export interface Check {
  id: string;
  category: "Crawler access" | "Structured data" | "Content" | "Product data";
  title: string;
  status: "pass" | "warn" | "fail";
  impact: "high" | "medium" | "low";
  detail: string;
  fix?: string;
  fixKind?: FixKind;
  pages?: string[];
}

export interface ShopifyProduct {
  title: string;
  handle: string;
  description: string;
  vendor?: string;
  price?: string;
  available?: boolean;
  image?: string;
  url: string;
}

export interface AuditResult {
  site: string;
  score: number;
  checks: Check[];
  pages: PageFacts[];
  products: ShopifyProduct[];
  robotsFound: boolean;
}

const UA = "AnswerGTM-Audit/0.2 (+https://github.com/vumoz/answergtm)";

export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.message : String(e) };
  }
};

export function siteRoot(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const u = new URL(withScheme);
  return `${u.protocol}//${u.host}`;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
}

async function sitemapUrls(fetcher: Fetcher, root: string, robots: Robots | null): Promise<string[]> {
  const first = robots?.sitemaps[0] ?? `${root}/sitemap.xml`;
  const res = await fetcher(first);
  if (res.status !== 200) return [];
  let urls = locs(res.text);
  if (/<sitemapindex/i.test(res.text)) {
    // Shopify and most CMSs split sitemaps; product sitemaps first, then pages.
    const children = urls.sort((a, b) => Number(/product/i.test(b)) - Number(/product/i.test(a))).slice(0, 3);
    urls = [];
    for (const child of children) {
      const c = await fetcher(child);
      if (c.status === 200) urls.push(...locs(c.text));
    }
  }
  return urls;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function shopifyProducts(fetcher: Fetcher, root: string): Promise<ShopifyProduct[]> {
  const res = await fetcher(`${root}/products.json?limit=50`);
  if (res.status !== 200) return [];
  try {
    const data = JSON.parse(res.text) as {
      products?: Array<{
        title: string;
        handle: string;
        body_html?: string;
        vendor?: string;
        images?: { src: string }[];
        variants?: { price?: string; available?: boolean }[];
      }>;
    };
    return (data.products ?? []).map((p) => ({
      title: p.title,
      handle: p.handle,
      description: stripHtml(p.body_html ?? ""),
      vendor: p.vendor,
      price: p.variants?.[0]?.price,
      available: p.variants?.some((v) => v.available !== false),
      image: p.images?.[0]?.src,
      url: `${root}/products/${p.handle}`,
    }));
  } catch {
    return [];
  }
}

const WEIGHT = { high: 3, medium: 2, low: 1 } as const;

/** Check how easy a site is for AI engines to crawl, understand and quote. */
export async function runAudit(input: string, opts: { fetcher?: Fetcher; maxProductPages?: number } = {}): Promise<AuditResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const root = siteRoot(input);
  const checks: Check[] = [];

  // 1. Crawler access -------------------------------------------------------
  const robotsRes = await fetcher(`${root}/robots.txt`);
  const robots = robotsRes.status === 200 ? parseRobots(robotsRes.text) : null;
  const blockedSearch = AI_BOTS.filter((b) => b.role === "search" && robots && !isAllowed(robots, b.agent));
  const blockedTraining = AI_BOTS.filter((b) => b.role === "training" && robots && !isAllowed(robots, b.agent));
  checks.push(
    blockedSearch.length
      ? {
          id: "ai-search-bots",
          category: "Crawler access",
          title: "AI search crawlers are blocked",
          status: "fail",
          impact: "high",
          detail: `robots.txt blocks ${blockedSearch.map((b) => `${b.agent} (${b.owner})`).join(", ")}. These engines cannot read the site, so they cannot cite it.`,
          fix: "Allow these crawlers in robots.txt.",
          fixKind: "robots",
        }
      : {
          id: "ai-search-bots",
          category: "Crawler access",
          title: "AI search crawlers can read the site",
          status: "pass",
          impact: "high",
          detail: robots ? "robots.txt allows ChatGPT, Perplexity, Claude, Google and Bing search crawlers." : "No robots.txt found, so all crawlers are allowed by default.",
        },
  );
  if (blockedTraining.length) {
    checks.push({
      id: "ai-training-bots",
      category: "Crawler access",
      title: "Some AI training crawlers are blocked",
      status: "warn",
      impact: "low",
      detail: `robots.txt blocks ${blockedTraining.map((b) => b.agent).join(", ")}. This is a valid choice; it mainly affects what models learn about the brand over time, not live answers.`,
      fix: "Decide on purpose whether to allow model training on the site.",
      fixKind: "robots",
    });
  }

  const llms = await fetcher(`${root}/llms.txt`);
  const hasLlms = llms.status === 200 && llms.text.trim().length > 0 && !/<html/i.test(llms.text);
  checks.push({
    id: "llms-txt",
    category: "Crawler access",
    title: hasLlms ? "llms.txt is published" : "No llms.txt file",
    status: hasLlms ? "pass" : "warn",
    impact: "low",
    detail: hasLlms
      ? "The site offers a plain-text summary for AI tools."
      : "llms.txt is a short plain-text guide to the site for AI tools. Support from engines is still limited, so this is a cheap, low-impact addition.",
    fix: hasLlms ? undefined : "Publish an llms.txt that lists the brand, products and key pages.",
    fixKind: hasLlms ? undefined : "llms",
  });

  // 2. Pages ----------------------------------------------------------------
  const urls = await sitemapUrls(fetcher, root, robots);
  checks.push({
    id: "sitemap",
    category: "Crawler access",
    title: urls.length ? `Sitemap lists ${urls.length} pages` : "No sitemap found",
    status: urls.length ? "pass" : "warn",
    impact: "medium",
    detail: urls.length ? "Crawlers can find the site's pages from the sitemap." : "Without a sitemap, crawlers may miss product and FAQ pages.",
    fix: urls.length ? undefined : "Publish /sitemap.xml and reference it in robots.txt.",
  });

  const productUrls = urls.filter((u) => /\/products?\//i.test(u)).slice(0, opts.maxProductPages ?? 5);
  const extraUrls = urls.filter((u) => /faq|about|ingredient|science|review/i.test(u)).slice(0, 3);
  const toFetch = [...new Set([`${root}/`, ...productUrls, ...extraUrls])];
  const pages: PageFacts[] = [];
  for (const u of toFetch) {
    const r = await fetcher(u);
    if (r.status === 0) continue;
    pages.push(analyzePage(u, r.status, r.status === 200 ? r.text : ""));
  }
  const ok = pages.filter((p) => p.status === 200);
  const home = ok.find((p) => p.url === `${root}/`);
  const productPages = ok.filter((p) => productUrls.includes(p.url));

  if (pages.length === 0 || !home) {
    checks.push({
      id: "reachable",
      category: "Crawler access",
      title: "Home page could not be loaded",
      status: "fail",
      impact: "high",
      detail: pages[0] ? `The home page returned HTTP ${pages[0].status}.` : "The site did not respond. Check the address.",
    });
  }

  const noindex = ok.filter((p) => p.noindex);
  if (noindex.length) {
    checks.push({
      id: "noindex",
      category: "Crawler access",
      title: "Pages are hidden from search",
      status: "fail",
      impact: "high",
      detail: "These pages carry a noindex tag, so search-based AI engines will skip them.",
      fix: "Remove the noindex tag from pages you want cited.",
      pages: noindex.map((p) => p.url),
    });
  }

  const thin = ok.filter((p) => p.wordCount < 150);
  checks.push({
    id: "readable-text",
    category: "Content",
    title: thin.length ? "Some pages show crawlers almost no text" : "Pages have readable text without JavaScript",
    status: thin.length ? "fail" : "pass",
    impact: "high",
    detail: thin.length
      ? "Most AI crawlers do not run JavaScript. These pages have under 150 words in their HTML, so engines have little to quote."
      : "Every page checked has at least 150 words in its plain HTML.",
    fix: thin.length ? "Put product facts, benefits, ingredients and FAQs in the page HTML, not only in scripts or images." : undefined,
    fixKind: thin.length ? "product-copy" : undefined,
    pages: thin.map((p) => p.url),
  });

  const missingMeta = ok.filter((p) => !p.metaDescription);
  checks.push({
    id: "meta-description",
    category: "Content",
    title: missingMeta.length ? "Pages missing a meta description" : "Every page has a meta description",
    status: missingMeta.length ? "warn" : "pass",
    impact: "low",
    detail: missingMeta.length ? "Engines often reuse this one-line summary." : "Each page has a summary engines can reuse.",
    fix: missingMeta.length ? "Write a one-sentence, factual description for each page." : undefined,
    pages: missingMeta.map((p) => p.url),
  });

  const faqPages = ok.filter((p) => p.questionHeadings >= 3 || p.schemaTypes.includes("FAQPage"));
  checks.push({
    id: "faq",
    category: "Content",
    title: faqPages.length ? "Site answers common questions" : "No question-and-answer content found",
    status: faqPages.length ? "pass" : "fail",
    impact: "high",
    detail: faqPages.length
      ? `Q&A content found on ${faqPages.length} page(s).`
      : "AI answers are built from text that directly answers a question. No page checked has an FAQ section.",
    fix: faqPages.length ? undefined : "Add an FAQ section that answers the prompts where the brand is weakest.",
    fixKind: faqPages.length ? undefined : "faq",
  });

  const quotable = ok.filter((p) => p.hasNumbers && p.externalLinks > 0);
  checks.push({
    id: "quotable-facts",
    category: "Content",
    title: quotable.length ? "Pages include facts and sources" : "Few quotable facts or cited sources",
    status: quotable.length ? "pass" : "warn",
    impact: "medium",
    detail: quotable.length
      ? `${quotable.length} page(s) give specific amounts and link to outside sources.`
      : "Research on generative engines found that adding statistics, quotes and cited sources raised visibility by roughly 30 to 40%. Pages checked give few doses, amounts or study links.",
    fix: quotable.length ? undefined : "State exact amounts per serving and link to the studies behind each ingredient.",
    fixKind: quotable.length ? undefined : "product-copy",
  });

  // 3. Structured data ------------------------------------------------------
  const hasOrg = ok.some((p) => p.schemaTypes.some((t) => t === "Organization" || t === "OnlineStore" || t === "Brand"));
  checks.push({
    id: "org-schema",
    category: "Structured data",
    title: hasOrg ? "Organization schema found" : "No Organization schema",
    status: hasOrg ? "pass" : "warn",
    impact: "medium",
    detail: hasOrg ? "Engines can tie the site to the brand name, logo and social profiles." : "Organization schema tells engines who the brand is and which profiles belong to it.",
    fix: hasOrg ? undefined : "Add Organization JSON-LD to the home page.",
    fixKind: hasOrg ? undefined : "org-schema",
  });

  if (productPages.length) {
    const noProduct = productPages.filter((p) => !p.product);
    const incomplete = productPages.filter((p) => p.product && !(p.product.price && p.product.availability));
    const noRating = productPages.filter((p) => !p.product?.aggregateRating);
    checks.push({
      id: "product-schema",
      category: "Structured data",
      title: noProduct.length || incomplete.length ? "Product schema missing or incomplete" : "Product pages have Product schema",
      status: noProduct.length ? "fail" : incomplete.length ? "warn" : "pass",
      impact: "high",
      detail:
        noProduct.length || incomplete.length
          ? "AI shopping results in ChatGPT, Gemini and Google AI Mode read Product, Offer and rating data. Some product pages lack it, or lack price and availability."
          : "Product, price and availability are machine-readable.",
      fix: noProduct.length || incomplete.length ? "Add complete Product JSON-LD with offers, price, availability and brand." : undefined,
      fixKind: noProduct.length || incomplete.length ? "product-schema" : undefined,
      pages: [...noProduct, ...incomplete].map((p) => p.url),
    });
    checks.push({
      id: "ratings-schema",
      category: "Structured data",
      title: noRating.length ? "Reviews are not machine-readable" : "Ratings are in structured data",
      status: noRating.length ? "warn" : "pass",
      impact: "medium",
      detail: noRating.length
        ? "Ratings shown only as images or widgets are invisible to AI engines."
        : "Engines can read star ratings and review counts.",
      fix: noRating.length ? "Expose aggregateRating and reviews in the Product JSON-LD (most review apps can do this)." : undefined,
      fixKind: noRating.length ? "product-schema" : undefined,
      pages: noRating.map((p) => p.url),
    });
  } else if (urls.length) {
    checks.push({
      id: "product-pages",
      category: "Product data",
      title: "No product pages found in the sitemap",
      status: "warn",
      impact: "medium",
      detail: "The audit looks for URLs containing /products/. If products live elsewhere, AI shopping engines may also struggle to find them.",
    });
  }

  // 4. Product feed ---------------------------------------------------------
  const products = await shopifyProducts(fetcher, root);
  if (products.length) {
    const shortDesc = products.filter((p) => p.description.split(" ").length < 80);
    const noImage = products.filter((p) => !p.image);
    checks.push({
      id: "product-descriptions",
      category: "Product data",
      title: shortDesc.length ? "Product descriptions are too short for AI shopping" : "Product descriptions are detailed",
      status: shortDesc.length ? "warn" : "pass",
      impact: "medium",
      detail: shortDesc.length
        ? `${shortDesc.length} of ${products.length} Shopify products have under 80 words of description. Shopping agents match products to questions using this text.`
        : `All ${products.length} Shopify products have detailed descriptions.`,
      fix: shortDesc.length ? "Expand descriptions with who it is for, ingredients and amounts, how to take it, and what makes it different." : undefined,
      fixKind: shortDesc.length ? "product-copy" : undefined,
      pages: shortDesc.map((p) => p.url),
    });
    if (noImage.length) {
      checks.push({
        id: "product-images",
        category: "Product data",
        title: "Products without images",
        status: "warn",
        impact: "low",
        detail: `${noImage.length} products have no image in the feed.`,
        pages: noImage.map((p) => p.url),
      });
    }
  }

  const total = checks.reduce((n, c) => n + WEIGHT[c.impact], 0);
  const earned = checks.reduce((n, c) => n + (c.status === "pass" ? WEIGHT[c.impact] : c.status === "warn" ? WEIGHT[c.impact] / 2 : 0), 0);
  const order = { fail: 0, warn: 1, pass: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status] || WEIGHT[b.impact] - WEIGHT[a.impact]);

  return { site: root, score: total ? Math.round((earned / total) * 100) : 0, checks, pages, products, robotsFound: !!robots };
}
