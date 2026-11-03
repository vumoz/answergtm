import Link from "next/link";
import { engineLabel } from "@app/components";
import { listAnswers, listPrompts, listRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Answers({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string; run?: string }>;
}) {
  const projectId = Number((await params).id);
  const sp = await searchParams;
  const runs = listRuns(projectId);
  const run = sp.run ? runs.find((r) => r.id === Number(sp.run)) : runs[0];
  const prompts = listPrompts(projectId);
  if (!run) return <p>No runs yet.</p>;

  const promptId = sp.prompt ? Number(sp.prompt) : undefined;
  const answers = listAnswers(run.id).filter((a) => !promptId || a.prompt_id === promptId);
  const promptText = new Map(prompts.map((p) => [p.id, p.text]));

  return (
    <>
      <h1>Answers</h1>
      <p className="sub">
        Every stored answer from run {run.id}, so you can check exactly what each engine said.{" "}
        {promptId && <Link href={`/p/${projectId}/answers?run=${run.id}`}>Show all prompts</Link>}
      </p>
      <form className="inline" style={{ marginBottom: 16 }}>
        <select name="run" defaultValue={String(run.id)}>
          {runs.map((r) => <option key={r.id} value={r.id}>Run {r.id} ({r.started_at}, {r.status})</option>)}
        </select>
        <select name="prompt" defaultValue={promptId ? String(promptId) : ""}>
          <option value="">All prompts</option>
          {prompts.map((p) => <option key={p.id} value={p.id}>{p.text}</option>)}
        </select>
        <button type="submit" className="secondary">Show</button>
      </form>
      {answers.map((a) => {
        const self = a.analysis?.brands.find((b) => b.key === "self");
        return (
          <div key={a.id} className="panel" style={{ padding: 16, marginBottom: 12 }}>
            <div>
              <strong>{engineLabel(a.engine)}</strong> <span className="quiet">sample {a.sample + 1} · {a.model}</span>
            </div>
            <div className="quiet">{promptText.get(a.prompt_id)}</div>
            {a.error ? (
              <p className="bad">Failed: {a.error}</p>
            ) : (
              <>
                <div style={{ marginTop: 8 }}>
                  {self?.mentioned ? (
                    <span className="pill good">Named, position #{self.position}, {self.sentiment}</span>
                  ) : (
                    <span className="pill bad">Not named</span>
                  )}
                  {a.analysis?.brands.filter((b) => b.key !== "self" && b.mentioned).map((b) => <span key={b.key} className="pill">{b.name} #{b.position}</span>)}
                </div>
                <pre className="answer">{a.text || "(empty answer)"}</pre>
                {a.citations.length > 0 && (
                  <div className="quiet">
                    Sources:{" "}
                    {a.citations.map((c, i) => (
                      <span key={c.url}>{i > 0 && ", "}<a href={c.url} target="_blank" rel="noreferrer">{c.domain}</a></span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
