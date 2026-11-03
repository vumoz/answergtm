import { describe, expect, it } from "vitest";
import { compareRates, wilson } from "../src/lib/stats";

describe("wilson", () => {
  it("matches known 95% intervals", () => {
    const r = wilson(5, 10);
    expect(r.rate).toBe(0.5);
    expect(r.low).toBeCloseTo(0.2366, 3);
    expect(r.high).toBeCloseTo(0.7634, 3);
  });
  it("gives a non-zero upper bound when nothing was seen", () => {
    const r = wilson(0, 10);
    expect(r.low).toBe(0);
    expect(r.high).toBeCloseTo(0.2775, 3);
  });
  it("handles zero trials", () => {
    expect(wilson(0, 0)).toMatchObject({ rate: 0, low: 0, high: 0 });
  });
});

describe("compareRates", () => {
  it("treats a small swing on few answers as noise", () => {
    const c = compareRates(wilson(11, 36), wilson(16, 36));
    expect(c.significant).toBe(false);
  });
  it("flags a large change on many answers", () => {
    const c = compareRates(wilson(60, 300), wilson(120, 300));
    expect(c.significant).toBe(true);
    expect(c.delta).toBeCloseTo(0.2, 5);
  });
});
