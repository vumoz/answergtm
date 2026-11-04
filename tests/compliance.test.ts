import { describe, expect, it } from "vitest";
import { checkClaims, DSHEA_DISCLAIMER } from "../src/lib/compliance";

describe("checkClaims", () => {
  it("blocks disease claims", () => {
    const r = checkClaims("Our formula cures fatty liver disease in weeks.");
    expect(r.verdict).toBe("block");
    expect(r.issues[0].rule).toBe("Disease claim");
  });
  it("blocks FDA approval and medication swaps", () => {
    expect(checkClaims("FDA-approved formula").verdict).toBe("block");
    expect(checkClaims("Use it instead of your medication.").issues.some((i) => i.rule === "Replaces medication")).toBe(true);
  });
  it("flags proof, hype, safety and detox wording for review", () => {
    const r = checkClaims("Clinically proven, risk-free miracle that flushes toxins. " + DSHEA_DISCLAIMER);
    expect(r.verdict).toBe("review");
    expect(r.issues.map((i) => i.rule).sort()).toEqual(["Detox claim", "Guarantee or hype", "Safety absolute", "Unsupported proof claim"]);
  });
  it("asks for the disclaimer on structure-function copy", () => {
    const r = checkClaims("Supports healthy liver function and comfortable digestion.");
    expect(r.verdict).toBe("review");
    expect(r.issues.map((i) => i.rule)).toEqual(["Missing FDA disclaimer"]);
  });
  it("passes compliant copy", () => {
    const r = checkClaims(`Supports healthy liver function with 150 mg of milk thistle extract per serving. ${DSHEA_DISCLAIMER}`);
    expect(r.verdict).toBe("ok");
    expect(r.issues).toHaveLength(0);
  });
  it("does not double-report one phrase", () => {
    const r = checkClaims("It treats arthritis.");
    expect(r.issues.filter((i) => i.severity === "block")).toHaveLength(1);
    expect(r.issues.some((i) => i.rule === "Treatment wording")).toBe(false);
  });
});
