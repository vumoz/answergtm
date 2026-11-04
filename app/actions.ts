"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCompetitor, addPrompt, createProject, deleteCompetitor, setPromptActive, updateBrand } from "@/lib/db";
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
