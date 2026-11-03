import { describe, expect, it } from "vitest";
import { analyzeAnswer, brandSentiment, domainOf, firstMention, urlsInText } from "../src/lib/analyze";
import type { BrandSpec } from "../src/lib/types";

const brands: BrandSpec[] = [
  { key: "self", name: "BioNature Bloom", aliases: ["BioNature"], domain: "bionaturebloom.com" },
  { key: "c:1", name: "Thorne", aliases: [], domain: "thorne.com" },
  { key: "c:2", name: "NOW Foods", aliases: [], domain: "nowfoods.com" },
];

describe("domainOf", () => {
  it("strips scheme, path and www", () => {
    expect(domainOf("https://www.Example.com/a/b?c=1")).toBe("example.com");
    expect(domainOf("shop.example.com")).toBe("shop.example.com");
  });
});

describe("firstMention", () => {
  it("matches whole words only, case-insensitively", () => {
    expect(firstMention("I like thorne products", ["Thorne"])).toBe(7);
    expect(firstMention("Thorneberry tea", ["Thorne"])).toBe(-1);
  });
  it("uses aliases", () => {
    expect(firstMention("Try BioNature capsules", ["BioNature Bloom", "BioNature"])).toBe(4);
  });
});

describe("analyzeAnswer", () => {
  const text = "1. Thorne is the best overall.\n2. BioNature Bloom is a great all-in-one option.\nNOW Foods is a budget pick.";
  const a = analyzeAnswer(text, [{ url: "https://bionaturebloom.com/liver", domain: "bionaturebloom.com" }, { url: "https://reddit.com/r/x", domain: "reddit.com" }], brands);

  it("orders brands by first mention", () => {
    expect(a.brands.find((b) => b.key === "c:1")?.position).toBe(1);
    expect(a.brands.find((b) => b.key === "self")?.position).toBe(2);
    expect(a.brands.find((b) => b.key === "c:2")?.position).toBe(3);
  });
  it("detects when the brand's own site is cited", () => {
    expect(a.brands.find((b) => b.key === "self")?.cited).toBe(true);
    expect(a.brands.find((b) => b.key === "c:1")?.cited).toBe(false);
    expect(a.citedDomains).toEqual(["bionaturebloom.com", "reddit.com"]);
  });
  it("marks absent brands", () => {
    const none = analyzeAnswer("Talk to your doctor first.", [], brands);
    expect(none.brands.every((b) => !b.mentioned && b.position === null && b.sentiment === null)).toBe(true);
  });
});

describe("brandSentiment", () => {
  it("reads positive and negative sentences", () => {
    expect(brandSentiment("Thorne is a trusted, high-quality brand.", ["Thorne"])).toBe("positive");
    expect(brandSentiment("Some users report complaints about Thorne.", ["Thorne"])).toBe("negative");
  });
  it("treats 'not recommended' as negative", () => {
    expect(brandSentiment("Thorne is not recommended for children.", ["Thorne"])).toBe("negative");
  });
});

describe("urlsInText", () => {
  it("extracts and dedupes links", () => {
    const c = urlsInText("See https://a.com/x. Also (https://a.com/x) and https://b.org/y,");
    expect(c.map((x) => x.url)).toEqual(["https://a.com/x", "https://b.org/y"]);
  });
});
