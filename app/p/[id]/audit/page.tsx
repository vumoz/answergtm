import Link from "next/link";
import { generateFixAction, runAuditAction } from "@app/actions";
import { SubmitButton } from "@app/client";
import { getProject, latestAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS = { fail: { label: "Fix", cls: "bad" }, warn: { label: "Improve", cls: "warn" }, pass: { label: "Good", cls: "good" } };
const FIX_LABEL: Record<string, string> = {
  robots: "Generate robots.txt fix",
  llms: "Generate llms.txt",
  "org-schema": "Generate Organization schema",
  "product-schema": "Generate Product schema",
  faq: "Draft FAQ",
  "product-copy": "Draft product copy",
};

export default async function Audit({ params }: { params: Promise<{ id: string }> }) {
  const projectId = Number((await params).id);
  const project = getProject(projectId)!;
  const audit = latestAudit(projectId);

  if (!project.brand_domain) {
    return (
      <>
        <h1>Site audit</h1>
        <p className="sub">Add your website first so we know which site to check.</p>
        <Link href={`/p/${projectId}/setup`}>Set your website</Link>
      </>
    );
  }

  return (
    <>
      <h1>Site audit</h1>
      <p className="sub">
        Checks whether AI engines can read, understand and quote {project.brand_domain}: crawler access, page text, structured data and product data.
      </p>
      <form action={runAuditAction.bind(null, projectId)} className="inline">
        <SubmitButton pending="Auditing… this takes up to a minute">{audit ? "Run the audit again" : "Run the audit"}</SubmitButton>
        {audit && <span className="quiet">Last run {audit.created_at} UTC on {audit.site}</span>}
      </form>

      {audit && (
        <>
          <div className="tiles" style={{ marginTop: 20 }}>
            <div className="tile">
              <div className="label">AI readiness score</div>
              <div className={`value ${audit.score >= 80 ? "good" : audit.score >= 50 ? "warn" : "bad"}`}>{audit.score}/100</div>
              <div className="note">Weighted by impact on AI visibility</div>
            </div>
            <div className="tile">
              <div className="label">To fix</div>
              <div className="value">{audit.result.checks.filter((c) => c.status === "fail").length}</div>
              <div className="note">{audit.result.checks.filter((c) => c.status === "warn").length} more to improve</div>
            </div>
            <div className="tile">
              <div className="label">Pages and products checked</div>
              <div className="value">{audit.result.pages.length}</div>
              <div className="note">{audit.result.products.length ? `${audit.result.products.length} product${audit.result.products.length === 1 ? "" : "s"} in the Shopify feed` : "No Shopify product feed found"}</div>
            </div>
          </div>

          <h2>Findings</h2>
          <div className="panel">
            <table>
              <tbody>
                {audit.result.checks.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 90 }}><span className={`pill ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span></td>
                    <td>
                      <strong>{c.title}</strong> <span className="quiet">· {c.category} · {c.impact} impact</span>
                      <div>{c.detail}</div>
                      {c.fix && <div className="quiet">What to do: {c.fix}</div>}
                      {c.pages && c.pages.length > 0 && (
                        <details>
                          <summary className="quiet">{c.pages.length} page(s)</summary>
                          {c.pages.map((p) => <div key={p}><a href={p} target="_blank" rel="noreferrer">{p}</a></div>)}
                        </details>
                      )}
                    </td>
                    <td className="num">
                      {c.fixKind && c.status !== "pass" && (
                        <form action={generateFixAction.bind(null, projectId, c.fixKind)}>
                          <SubmitButton className="secondary" pending="Generating…">{FIX_LABEL[c.fixKind]}</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
