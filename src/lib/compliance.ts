/**
 * Claim checker for dietary supplement copy (US rules: FTC truth-in-advertising
 * and FDA/DSHEA structure-function claims). It flags wording that commonly gets
 * supplement brands warning letters. It is a first pass, not legal advice.
 */

export type Severity = "block" | "review";

export interface ClaimIssue {
  severity: Severity;
  rule: string;
  match: string;
  index: number;
  why: string;
  suggestion: string;
}

export interface ComplianceResult {
  verdict: "ok" | "review" | "block";
  issues: ClaimIssue[];
  usesStructureFunction: boolean;
  hasDisclaimer: boolean;
}

export const DSHEA_DISCLAIMER =
  "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.";

const DISEASES = [
  "cancer", "tumou?rs?", "diabetes", "hepatitis", "cirrhosis", "fatty liver disease", "nafld", "liver disease",
  "liver failure", "kidney disease", "arthritis", "osteoarthritis", "rheumatoid", "ibs", "irritable bowel syndrome",
  "crohn'?s", "colitis", "gerd", "acid reflux disease", "ulcers?", "infections?", "depression", "anxiety disorders?",
  "alzheimer'?s", "dementia", "heart disease", "hypertension", "high blood pressure", "high cholesterol", "covid(-19)?",
  "obesity", "insomnia", "gout", "fibromyalgia", "psoriasis", "eczema", "candida", "sibo", "gallstones",
];
const DISEASE = `(?:${DISEASES.join("|")})`;
const TREAT_VERBS = "(?:cures?|cured|curing|treats?|treated|treating|treatment for|heals?|healing|prevents?|preventing|reverses?|reversing|diagnoses?|eliminates?|fights?|fighting|eradicates?|kills?)";

interface Rule {
  name: string;
  severity: Severity;
  pattern: RegExp;
  why: string;
  suggestion: string;
}

const RULES: Rule[] = [
  {
    name: "Disease claim",
    severity: "block",
    pattern: new RegExp(`\\b${TREAT_VERBS}\\b(?:\\W+\\w+){0,5}?\\W+${DISEASE}\\b`, "gi"),
    why: "Supplements may not claim to cure, treat or prevent a disease. This turns the product into an unapproved drug in the FDA's eyes.",
    suggestion: "Describe normal body function instead, e.g. \"supports healthy liver function\".",
  },
  {
    name: "Disease named as the target",
    severity: "review",
    pattern: new RegExp(`\\b(?:for|against|with|relief from|help with)\\s+(?:your\\s+)?${DISEASE}\\b`, "gi"),
    why: "Linking the product to a named disease implies a disease claim even without the word \"cure\".",
    suggestion: "Remove the disease name, or move it to clearly separate educational content with no product link.",
  },
  {
    name: "Treatment wording",
    severity: "review",
    pattern: new RegExp(`\\b${TREAT_VERBS}\\b`, "gi"),
    why: "Words like cure, treat, heal and prevent read as drug claims.",
    suggestion: "Use support, promote or help maintain, tied to normal function.",
  },
  {
    name: "FDA approval claim",
    severity: "block",
    pattern: /\bFDA[- ](?:approved|certified|registered|cleared)\b/gi,
    why: "The FDA does not approve dietary supplements. Saying so is false and misleading.",
    suggestion: "Say \"made in an FDA-registered facility\" only if true, or \"third-party tested\".",
  },
  {
    name: "Replaces medication",
    severity: "block",
    pattern: /\b(?:replaces?|instead of|substitute for|alternative to|no need for|stop taking)\s+(?:your\s+)?(?:medications?|medicines?|prescriptions?|drugs?|statins?|insulin|antibiotics?)\b/gi,
    why: "Suggesting people swap prescribed medicine for a supplement is dangerous and a top enforcement target.",
    suggestion: "Remove it. If relevant, say \"talk to your doctor before use if you take medication\".",
  },
  {
    name: "Unsupported proof claim",
    severity: "review",
    pattern: /\b(?:clinically|scientifically|medically)\s+(?:proven|tested|backed|shown)\b|\bdoctor[- ](?:recommended|approved)\b|\bstudies (?:prove|show)\b/gi,
    why: "The FTC requires competent and reliable scientific evidence for the specific product and claim.",
    suggestion: "Name and link the actual study, and describe what it found about the ingredient, not the whole product.",
  },
  {
    name: "Guarantee or hype",
    severity: "review",
    pattern: /\b(?:guaranteed results?|100% effective|works for everyone|miracle|magic(?:al)?|instant(?:ly)? results?|overnight results?|breakthrough)\b/gi,
    why: "Absolute or miracle language is a classic deceptive-advertising signal and erodes trust.",
    suggestion: "Use specific, honest wording, e.g. \"many customers notice a difference within a few weeks\" (only if your reviews support it).",
  },
  {
    name: "Safety absolute",
    severity: "review",
    pattern: /\b(?:no side effects|zero side effects|completely safe|100% safe|safe for everyone|risk[- ]free|no risks?)\b/gi,
    why: "No product is safe for everyone. Absolute safety claims are misleading.",
    suggestion: "Say \"made with well-tolerated ingredients\" and add who should check with a doctor first.",
  },
  {
    name: "Detox claim",
    severity: "review",
    pattern: /\b(?:detox(?:es|ify|ifies|ification)?|flush(?:es)? (?:out )?toxins|cleanses? (?:your )?(?:liver|body|blood))\b/gi,
    why: "Detox and cleanse claims draw FTC scrutiny when the toxins are unnamed and unmeasured.",
    suggestion: "Describe the function, e.g. \"supports the liver's natural processes\".",
  },
];

const STRUCTURE_FUNCTION = /\b(?:supports?|promotes?|helps? (?:maintain|support|promote)|maintains?|contributes? to|encourages?)\b/i;

function overlaps(a: ClaimIssue, b: ClaimIssue) {
  return a.index < b.index + b.match.length && b.index < a.index + a.match.length;
}

const DISCLAIMER_SPAN = /these statements have not been evaluated by the (?:food and drug administration|fda)[^.]*\.[^.]*not intended to diagnose, treat, cure,? or prevent any disease\.?/gi;

export function checkClaims(text: string): ComplianceResult {
  const found: ClaimIssue[] = [];
  // The required disclaimer itself says "diagnose, treat, cure, or prevent"; never flag it.
  const safe = [...text.matchAll(DISCLAIMER_SPAN)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const inSafe = (i: number) => safe.some(([a, b]) => i >= a && i < b);
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      if (inSafe(m.index ?? 0)) continue;
      const issue: ClaimIssue = { severity: rule.severity, rule: rule.name, match: m[0], index: m.index ?? 0, why: rule.why, suggestion: rule.suggestion };
      // Keep only the most specific finding for overlapping text (rules are ordered most specific first).
      if (!found.some((f) => overlaps(f, issue))) found.push(issue);
    }
  }
  found.sort((a, b) => a.index - b.index);

  const usesStructureFunction = STRUCTURE_FUNCTION.test(text);
  const hasDisclaimer = /not been evaluated by the (?:Food and Drug Administration|FDA)/i.test(text);
  if (usesStructureFunction && !hasDisclaimer) {
    found.push({
      severity: "review",
      rule: "Missing FDA disclaimer",
      match: "",
      index: text.length,
      why: "Copy with structure-function claims (supports, promotes, maintains) must carry the standard DSHEA disclaimer.",
      suggestion: DSHEA_DISCLAIMER,
    });
  }

  const verdict = found.some((f) => f.severity === "block") ? "block" : found.length ? "review" : "ok";
  return { verdict, issues: found, usesStructureFunction, hasDisclaimer };
}
