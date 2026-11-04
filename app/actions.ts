"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addCompetitor,
  addPrompt,
  createProject,
  deleteCompetitor,
  deleteFix,
  getProject,
  latestAudit,
  listPrompts,
  saveAudit,
  saveFix,
  setPromptActive,
  updateBrand,
} from "@/lib/db";
import { runAudit, siteRoot, type FixKind } from "@/lib/audit";
import { checkClaims, type ComplianceResult } from "@/lib/compliance";
import { draftContent, llmsTxt, orgSchema, productSchema, robotsFix } from "@/lib/fixes";
import { buildReport } from "@/lib/report";
import { runTracking } from "@/lib/runner";
import type { EngineId } from "@/lib/types";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function createProjectAction(form: FormData) {
  const brandName = String(form.get("brandName") ?? "").trim();
  if (!brandName) return;
  const id = createProject({
    name: brandName,
    brandName,
    brandDomain: String(form.get("brandDomain") ?? "").trim() || undefined,
    aliases: list(form.get("aliases")),
    country: String(form.get("country") ?? "").trim().toUpperCase() || undefined,
  });
  redirect(`/p/${id}/setup`);
}

export async function updateBrandAction(projectId: number, form: FormData) {
  const raw = String(form.get("brandDomain") ?? "").trim();
  // Accept a full link like https://www.example.com/shop and keep just the domain.
  const brandDomain = raw ? raw.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase() : null;
  updateBrand(projectId, { brandDomain, aliases: list(form.get("aliases")) });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function addPromptAction(projectId: number, form: FormData) {
  const lines = String(form.get("prompts") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const topic = String(form.get("topic") ?? "").trim() || undefined;
  for (const line of lines) addPrompt(projectId, line, topic);
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function togglePromptAction(projectId: number, promptId: number, active: boolean) {
  setPromptActive(promptId, active);
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function addCompetitorAction(projectId: number, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  addCompetitor(projectId, {
    name,
    domain: String(form.get("domain") ?? "").trim() || undefined,
    aliases: list(form.get("aliases")),
  });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function deleteCompetitorAction(projectId: number, competitorId: number) {
  deleteCompetitor(competitorId);
  revalidatePath(`/p/${projectId}`, "layout");
}

/** Starts a run in the background; the overview shows it as running until it finishes. */
export async function startRunAction(projectId: number, form: FormData) {
  const samples = Math.min(10, Math.max(1, Number(form.get("samples") ?? 3)));
  const engines = form.getAll("engines").map(String) as EngineId[];
  void runTracking({ projectId, samples, engines: engines.length ? engines : undefined }).catch((e) =>
    console.error("Tracking run failed:", e),
  );
  // Give the run a moment to register so the page shows it.
  await new Promise((r) => setTimeout(r, 300));
  revalidatePath(`/p/${projectId}`, "layout");
}

// Phase 2: audit and fixes ----------------------------------------------------

export async function runAuditAction(projectId: number) {
  const project = getProject(projectId);
  if (!project?.brand_domain) return;
  const result = await runAudit(project.brand_domain);
  saveAudit(projectId, result);
  revalidatePath(`/p/${projectId}`, "layout");
}

/** Prompts where the brand is named in under half of answers, weakest first. */
function weakQuestions(projectId: number, limit = 8): string[] {
  const report = buildReport(projectId);
  if (report) return report.prompts.filter((p) => p.mention.rate < 0.5).slice(0, limit).map((p) => p.text);
  return listPrompts(projectId, true).slice(0, limit).map((p) => p.text);
}

export async function generateFixAction(projectId: number, kind: FixKind) {
  const project = getProject(projectId);
  if (!project) return;
  const audit = latestAudit(projectId)?.result;
  const site = audit?.site ?? (project.brand_domain ? siteRoot(project.brand_domain) : "https://example.com");
  const brand = project.brand_name;

  if (kind === "robots") {
    saveFix({ projectId, kind, title: "robots.txt: allow AI search crawlers", content: robotsFix(), format: "text" });
  } else if (kind === "llms") {
    const summary = `${brand} makes dietary supplements. Add one factual sentence on what makes the products different.`;
    saveFix({ projectId, kind, title: "llms.txt for the site root", content: llmsTxt({ brand, site, summary, products: audit?.products ?? [] }), format: "text" });
  } else if (kind === "org-schema") {
    saveFix({ projectId, kind, title: "Organization schema for the home page", content: orgSchema({ brand, site }), format: "html" });
  } else if (kind === "product-schema") {
    const products = audit?.products ?? [];
    if (products.length === 0) {
      saveFix({
        projectId,
        kind,
        title: "Product schema template",
        content: productSchema({ title: "[Product name]", handle: "", description: "[Product description]", price: "[price]", url: `${site}/products/[handle]` }, brand),
        format: "html",
      });
    }
    for (const p of products.slice(0, 10)) {
      saveFix({ projectId, kind, title: `Product schema: ${p.title}`, content: productSchema(p, brand), format: "html" });
    }
  } else {
    await draftAction(projectId, kind, { facts: "", questions: weakQuestions(projectId) });
  }
  revalidatePath(`/p/${projectId}`, "layout");
  redirect(`/p/${projectId}/fixes`);
}

async function draftAction(projectId: number, kind: "faq" | "product-copy", o: { facts: string; questions: string[]; productName?: string }) {
  const project = getProject(projectId)!;
  const draft = await draftContent({ kind, brand: project.brand_name, facts: o.facts, questions: o.questions, productName: o.productName });
  saveFix({
    projectId,
    kind,
    title: kind === "faq" ? "FAQ section for weak prompts" : `Product page copy${o.productName ? `: ${o.productName}` : ""}`,
    content: draft.content,
    compliance: draft.compliance,
    generatedBy: draft.generatedBy,
  });
}

export async function draftFormAction(projectId: number, form: FormData) {
  const kind = form.get("kind") === "product-copy" ? "product-copy" : "faq";
  const questions = String(form.get("questions") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  await draftAction(projectId, kind, {
    facts: String(form.get("facts") ?? "").trim(),
    questions: questions.length ? questions : weakQuestions(projectId),
    productName: String(form.get("productName") ?? "").trim() || undefined,
  });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function deleteFixAction(projectId: number, fixId: number) {
  deleteFix(fixId);
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function checkCopyAction(_prev: ComplianceResult | null, form: FormData): Promise<ComplianceResult | null> {
  const text = String(form.get("copy") ?? "");
  return text.trim() ? checkClaims(text) : null;
}
