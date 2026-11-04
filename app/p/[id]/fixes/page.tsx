import { deleteFixAction, draftFormAction } from "@app/actions";
import { ClaimChecker, ComplianceIssues, CopyButton, SubmitButton } from "@app/client";
import { getProject, listFixes, listPrompts } from "@/lib/db";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";

const VERDICT = { ok: { label: "Claims OK", cls: "good" }, review: { label: "Review claims", cls: "warn" }, block: { label: "Claim problems", cls: "bad" } };

export default async function Fixes({ params }: { params: Promise<{ id: string }> }) {
  const projectId = Number((await params).id);
  const project = getProject(projectId)!;
  const fixes = listFixes(projectId);
  const report = buildReport(projectId);
  const weak = report ? report.prompts.filter((p) => p.mention.rate < 0.5).map((p) => p.text) : listPrompts(projectId, true).map((p) => p.text);
  const hasClaude = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  return (
    <>
      <h1>Fix studio</h1>
      <p className="sub">Ready-to-publish fixes for {project.brand_name}. Every written draft is checked against supplement claim rules before you use it.</p>

      <div className="grid2">
        <div>
          <h2>Draft new content</h2>
          {!hasClaude && (
            <div className="callout">No Anthropic key is set, so drafts come back as fill-in templates. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> to have Claude write them.</div>
          )}
          <form action={draftFormAction.bind(null, projectId)}>
            <div className="inline">
              <select name="kind" defaultValue="faq">
                <option value="faq">FAQ section</option>
                <option value="product-copy">Product page copy</option>
              </select>
              <input name="productName" placeholder="Product name (for product copy)" />
            </div>
            <p className="quiet">Facts to use: ingredients and amounts, testing, sourcing, how to take it, guarantee. Nothing is invented; gaps are marked [ADD].</p>
            <textarea name="facts" rows={5} style={{ width: "100%" }} placeholder="e.g. 150 mg milk thistle (80% silymarin), 500 mg turmeric with black pepper, third-party tested, 60 capsules, take 2 daily with food" />
            <p className="quiet">Questions to answer, one per line. Prefilled with the prompts where AI names you least.</p>
            <textarea name="questions" rows={5} style={{ width: "100%" }} defaultValue={weak.slice(0, 8).join("\n")} />
            <div style={{ marginTop: 8 }}>
              <SubmitButton pending={hasClaude ? "Claude is writing… up to a minute" : "Working…"}>Draft it</SubmitButton>
            </div>
          </form>
        </div>
        <div>
          <h2>Check any copy</h2>
          <p className="quiet">Paste ad copy, emails or landing page text to catch claims that could get a supplement brand in trouble. A first pass, not legal advice.</p>
          <ClaimChecker />
        </div>
      </div>

      <h2>Your fixes ({fixes.length})</h2>
      {fixes.length === 0 && <p className="quiet">Nothing yet. Generate fixes from the Site audit page or draft content above.</p>}
      {fixes.map((f) => (
        <div key={f.id} className="panel" style={{ padding: 16, marginBottom: 12 }}>
          <div className="inline" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{f.title}</strong>{" "}
              {f.compliance && <span className={`pill ${VERDICT[f.compliance.verdict].cls}`}>{VERDICT[f.compliance.verdict].label}</span>}
              <span className="quiet"> {f.created_at} UTC{f.generated_by ? ` · ${f.generated_by === "claude" ? "written by Claude" : "template"}` : ""}</span>
            </div>
            <div className="inline">
              <CopyButton text={f.content} />
              <form action={deleteFixAction.bind(null, projectId, f.id)}>
                <button className="secondary" type="submit">Delete</button>
              </form>
            </div>
          </div>
          {f.compliance && f.compliance.verdict !== "ok" && <ComplianceIssues result={f.compliance} />}
          <pre className="answer">{f.content}</pre>
          <div className="quiet">{HOW_TO[f.kind]}</div>
        </div>
      ))}
    </>
  );
}

const HOW_TO: Record<string, string> = {
  robots: "Shopify: Online Store → Themes → Edit code → add a robots.txt.liquid template and paste these lines. Other sites: add them to /robots.txt.",
  llms: "Upload as llms.txt at the root of the site. On Shopify, create a page or use an app that serves files at the root.",
  "org-schema": "Paste into the <head> of the home page (Shopify: theme.liquid).",
  "product-schema": "Many Shopify themes already output Product schema; check first. Otherwise paste into the product template and fill in rating values from your review app.",
  faq: "Publish on a dedicated FAQ page and link it from product pages. Fill every [ADD] before publishing.",
  "product-copy": "Replace the product description in Shopify Admin → Products. Fill every [ADD] before publishing.",
};
