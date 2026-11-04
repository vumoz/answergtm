import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { AnswerAnalysis, BrandSpec, Citation } from "./types";
import type { AuditResult } from "./audit";
import type { ComplianceResult } from "./compliance";

export interface Project {
  id: number;
  name: string;
  brand_name: string;
  brand_domain: string | null;
  brand_aliases: string[];
  country: string | null;
  created_at: string;
}
export interface Competitor {
  id: number;
  project_id: number;
  name: string;
  domain: string | null;
  aliases: string[];
}
export interface Prompt {
  id: number;
  project_id: number;
  text: string;
  topic: string | null;
  active: boolean;
}
export interface Run {
  id: number;
  project_id: number;
  started_at: string;
  finished_at: string | null;
  samples: number;
  engines: string[];
  status: "running" | "done" | "failed";
}
export interface AnswerRow {
  id: number;
  run_id: number;
  prompt_id: number;
  engine: string;
  sample: number;
  text: string;
  citations: Citation[];
  analysis: AnswerAnalysis | null;
  model: string | null;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  brand_domain TEXT,
  brand_aliases TEXT NOT NULL DEFAULT '[]',
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  aliases TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  topic TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  samples INTEGER NOT NULL,
  engines TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  sample INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  citations TEXT NOT NULL DEFAULT '[]',
  analysis TEXT,
  model TEXT,
  error TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS answers_run ON answers(run_id);
CREATE INDEX IF NOT EXISTS answers_prompt ON answers(prompt_id);
CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  score INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fixes (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  compliance TEXT,
  generated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "tracker.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** For tests: drop the cached connection so a new DATABASE_PATH takes effect. */
export function resetDb() {
  db?.close();
  db = null;
}

type Row = Record<string, unknown>;
const json = <T>(v: unknown, fallback: T): T => (typeof v === "string" ? (JSON.parse(v) as T) : fallback);

function toProject(r: Row): Project {
  return { ...(r as unknown as Project), brand_aliases: json(r.brand_aliases, []) };
}
function toCompetitor(r: Row): Competitor {
  return { ...(r as unknown as Competitor), aliases: json(r.aliases, []) };
}
function toPrompt(r: Row): Prompt {
  return { ...(r as unknown as Prompt), active: r.active === 1 };
}
function toRun(r: Row): Run {
  return { ...(r as unknown as Run), engines: json(r.engines, []) };
}
function toAnswer(r: Row): AnswerRow {
  return {
    ...(r as unknown as AnswerRow),
    citations: json(r.citations, []),
    analysis: json<AnswerAnalysis | null>(r.analysis, null),
  };
}

// Projects -------------------------------------------------------------------

export function createProject(p: { name: string; brandName: string; brandDomain?: string; aliases?: string[]; country?: string }): number {
  const res = getDb()
    .prepare("INSERT INTO projects (name, brand_name, brand_domain, brand_aliases, country) VALUES (?, ?, ?, ?, ?)")
    .run(p.name, p.brandName, p.brandDomain ?? null, JSON.stringify(p.aliases ?? []), p.country ?? null);
  return Number(res.lastInsertRowid);
}
export function listProjects(): Project[] {
  return getDb().prepare("SELECT * FROM projects ORDER BY id").all().map(toProject);
}
export function getProject(id: number): Project | undefined {
  const r = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return r ? toProject(r) : undefined;
}

export function updateBrand(id: number, b: { brandDomain?: string | null; aliases?: string[] }) {
  getDb()
    .prepare("UPDATE projects SET brand_domain = ?, brand_aliases = ? WHERE id = ?")
    .run(b.brandDomain ?? null, JSON.stringify(b.aliases ?? []), id);
}

// Competitors ----------------------------------------------------------------

export function addCompetitor(projectId: number, c: { name: string; domain?: string; aliases?: string[] }): number {
  const res = getDb()
    .prepare("INSERT INTO competitors (project_id, name, domain, aliases) VALUES (?, ?, ?, ?)")
    .run(projectId, c.name, c.domain ?? null, JSON.stringify(c.aliases ?? []));
  return Number(res.lastInsertRowid);
}
export function listCompetitors(projectId: number): Competitor[] {
  return getDb().prepare("SELECT * FROM competitors WHERE project_id = ? ORDER BY id").all(projectId).map(toCompetitor);
}
export function deleteCompetitor(id: number) {
  getDb().prepare("DELETE FROM competitors WHERE id = ?").run(id);
}

// Prompts --------------------------------------------------------------------

export function addPrompt(projectId: number, text: string, topic?: string): number {
  const res = getDb().prepare("INSERT INTO prompts (project_id, text, topic) VALUES (?, ?, ?)").run(projectId, text, topic ?? null);
  return Number(res.lastInsertRowid);
}
export function listPrompts(projectId: number, onlyActive = false): Prompt[] {
  const sql = `SELECT * FROM prompts WHERE project_id = ? ${onlyActive ? "AND active = 1" : ""} ORDER BY id`;
  return getDb().prepare(sql).all(projectId).map(toPrompt);
}
export function setPromptActive(id: number, active: boolean) {
  getDb().prepare("UPDATE prompts SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

// Runs and answers -----------------------------------------------------------

export function createRun(projectId: number, samples: number, engines: string[]): number {
  const res = getDb().prepare("INSERT INTO runs (project_id, samples, engines) VALUES (?, ?, ?)").run(projectId, samples, JSON.stringify(engines));
  return Number(res.lastInsertRowid);
}
export function finishRun(id: number, status: "done" | "failed") {
  getDb().prepare("UPDATE runs SET status = ?, finished_at = datetime('now') WHERE id = ?").run(status, id);
}
export function listRuns(projectId: number): Run[] {
  return getDb().prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY id DESC").all(projectId).map(toRun);
}
export function getRun(id: number): Run | undefined {
  const r = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id);
  return r ? toRun(r) : undefined;
}

export function insertAnswer(a: {
  runId: number;
  promptId: number;
  engine: string;
  sample: number;
  text: string;
  citations: Citation[];
  analysis: AnswerAnalysis | null;
  model?: string | null;
  error?: string | null;
  latencyMs?: number | null;
}): number {
  const res = getDb()
    .prepare(
      "INSERT INTO answers (run_id, prompt_id, engine, sample, text, citations, analysis, model, error, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      a.runId,
      a.promptId,
      a.engine,
      a.sample,
      a.text,
      JSON.stringify(a.citations),
      a.analysis ? JSON.stringify(a.analysis) : null,
      a.model ?? null,
      a.error ?? null,
      a.latencyMs ?? null,
    );
  return Number(res.lastInsertRowid);
}
export function listAnswers(runId: number): AnswerRow[] {
  return getDb().prepare("SELECT * FROM answers WHERE run_id = ? ORDER BY prompt_id, engine, sample").all(runId).map(toAnswer);
}
export function getAnswer(id: number): AnswerRow | undefined {
  const r = getDb().prepare("SELECT * FROM answers WHERE id = ?").get(id);
  return r ? toAnswer(r) : undefined;
}

/** The tracked brand plus its competitors, in the shape the analyser needs. */
export function brandSpecs(projectId: number): BrandSpec[] {
  const p = getProject(projectId);
  if (!p) throw new Error(`Project ${projectId} not found`);
  return [
    { key: "self", name: p.brand_name, aliases: p.brand_aliases, domain: p.brand_domain },
    ...listCompetitors(projectId).map((c) => ({ key: `c:${c.id}`, name: c.name, aliases: c.aliases, domain: c.domain })),
  ];
}

// Audits and fixes -----------------------------------------------------------

export interface AuditRow {
  id: number;
  project_id: number;
  site: string;
  score: number;
  result: AuditResult;
  created_at: string;
}
export interface FixRow {
  id: number;
  project_id: number;
  kind: string;
  title: string;
  content: string;
  format: "markdown" | "html" | "text";
  compliance: ComplianceResult | null;
  generated_by: string | null;
  created_at: string;
}

export function saveAudit(projectId: number, result: AuditResult): number {
  const res = getDb()
    .prepare("INSERT INTO audits (project_id, site, score, result) VALUES (?, ?, ?, ?)")
    .run(projectId, result.site, result.score, JSON.stringify(result));
  return Number(res.lastInsertRowid);
}
export function latestAudit(projectId: number): AuditRow | undefined {
  const r = getDb().prepare("SELECT * FROM audits WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(projectId);
  return r ? ({ ...(r as unknown as AuditRow), result: json<AuditResult>(r.result, {} as AuditResult) }) : undefined;
}

export function saveFix(f: { projectId: number; kind: string; title: string; content: string; format?: FixRow["format"]; compliance?: ComplianceResult | null; generatedBy?: string }): number {
  const res = getDb()
    .prepare("INSERT INTO fixes (project_id, kind, title, content, format, compliance, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(f.projectId, f.kind, f.title, f.content, f.format ?? "markdown", f.compliance ? JSON.stringify(f.compliance) : null, f.generatedBy ?? null);
  return Number(res.lastInsertRowid);
}
function toFix(r: Row): FixRow {
  return { ...(r as unknown as FixRow), compliance: json<ComplianceResult | null>(r.compliance, null) };
}
export function listFixes(projectId: number): FixRow[] {
  return getDb().prepare("SELECT * FROM fixes WHERE project_id = ? ORDER BY id DESC").all(projectId).map(toFix);
}
export function getFix(id: number): FixRow | undefined {
  const r = getDb().prepare("SELECT * FROM fixes WHERE id = ?").get(id);
  return r ? toFix(r) : undefined;
}
export function deleteFix(id: number) {
  getDb().prepare("DELETE FROM fixes WHERE id = ?").run(id);
}
