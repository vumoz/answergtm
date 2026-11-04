import { parse } from "node-html-parser";

export interface PageFacts {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  noindex: boolean;
  wordCount: number;
  questionHeadings: number;
  hasNumbers: boolean;
  externalLinks: number;
  schemaTypes: string[];
  product: ProductSchemaFacts | null;
}

export interface ProductSchemaFacts {
  name: boolean;
  description: boolean;
  image: boolean;
  brand: boolean;
  price: boolean;
  availability: boolean;
  aggregateRating: boolean;
  review: boolean;
}

type Json = Record<string, unknown>;

/** Flatten JSON-LD, including @graph arrays, into a list of typed nodes. */
export function jsonLdNodes(html: string): Json[] {
  const root = parse(html);
  const out: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === "object") {
      const o = v as Json;
      if (o["@type"]) out.push(o);
      if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
    }
  };
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent));
    } catch {
      // Broken JSON-LD is reported by the schema check as missing.
    }
  }
  return out;
}

function types(node: Json): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).map(String);
}

function productFacts(node: Json): ProductSchemaFacts {
  const offers = ([] as unknown[]).concat(node.offers ?? []) as Json[];
  const offer = offers[0] ?? {};
  return {
    name: !!node.name,
    description: !!node.description,
    image: !!node.image,
    brand: !!node.brand,
    price: offer.price != null || offer.lowPrice != null,
    availability: !!offer.availability,
    aggregateRating: !!node.aggregateRating,
    review: !!node.review,
  };
}

/** What an AI crawler sees on one page, without running JavaScript. */
export function analyzePage(url: string, status: number, html: string): PageFacts {
  const root = parse(html);
  const nodes = jsonLdNodes(html);
  const schemaTypes = [...new Set(nodes.flatMap(types))];
  const productNode = nodes.find((n) => types(n).includes("Product"));

  for (const el of root.querySelectorAll("script, style, noscript, template, svg")) el.remove();
  const text = (root.querySelector("body") ?? root).textContent.replace(/\s+/g, " ").trim();
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const externalLinks = root
    .querySelectorAll("a[href]")
    .map((a) => a.getAttribute("href") ?? "")
    .filter((href) => /^https?:\/\//.test(href) && !href.includes(host)).length;
  const headings = root.querySelectorAll("h2, h3, h4, summary, dt");

  return {
    url,
    status,
    title: root.querySelector("title")?.textContent.trim() || null,
    metaDescription: root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null,
    h1Count: root.querySelectorAll("h1").length,
    noindex: /noindex/i.test(root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? ""),
    wordCount: text ? text.split(" ").length : 0,
    questionHeadings: headings.filter((h) => h.textContent.trim().endsWith("?")).length,
    hasNumbers: /\d+(\.\d+)?\s?(%|mg|g|mcg|iu|studies|participants|weeks|days)\b/i.test(text),
    externalLinks,
    schemaTypes,
    product: productNode ? productFacts(productNode) : null,
  };
}
