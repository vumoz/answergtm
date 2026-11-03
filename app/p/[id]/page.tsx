import Link from "next/link";
import { startRunAction } from "@app/actions";
import { RangeText, RateBar, engineLabel } from "@app/components";
import { getProject, listPrompts, listRuns } from "@/lib/db";
import { ALL_ENGINES } from "@/lib/engines";
import { buildReport } from "@/lib/report";
import { pct } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const projectId = Number((await params).id);
  const project = getProject(projectId)!;
  const report = buildReport(projectId);
  const running = listRuns(projectId).find((r) => r.status === "running");
  const promptCount = listPrompts(projectId, true).length;
  const configured = ALL_ENGINES.filter((e) => e.isConfigured());
  const onlyDemo = configured.every((e) => e.id === "demo");

  const runForm = (
    <form action={startRunAction.bind(null, projectId)} className="inline">
      {configured.map((e) => (
        <label key={e.id} className="pill">
          <input type="checkbox" name="engines" value={e.id} defaultChecked={onlyDemo || e.id !== "demo"} /> {e.label}
        </label>
      ))}
      <label>
        Samples per prompt{" "}
        <select name="samples" defaultValue="3">
          {[1, 2, 3, 5, 10].map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!!running || promptCount === 0}>
        {running ? "Run in progress…" : "Run tracking now"}
      </button>
    </form>
  );

  if (!report) {
    return (
      <>
        <h1>{project.brand_name}</h1>
        <p className="sub">No tracking runs yet. {promptCount} active prompts are ready.</p>
        {onlyDemo && <DemoNote />}
        {runForm}
      </>
    );
  }

  const r = report;
  const selfBrand = r.brands.find((b) => b.isSelf)!;
  const cited = r.engines.reduce((n, e) => n + e.cited.successes, 0);
  const usesDemo = r.run.engines.includes("demo");

  return (
    <>
      <h1>{project.brand_name}</h1>
      <p className="sub">
        Run {r.run.id}, {r.run.started_at} UTC. {r.validAnswers} answers from {r.run.engines.map(engineLabel).join(", ")}, each prompt asked {r.run.samples} times per engine.
        {r.errors > 0 && <span className="warn"> {r.errors} answers failed (see Answers).</span>}
      </p>
      {usesDemo && <DemoNote />}

      <div className="tiles">
        <div className="tile">
          <div className="label">Answers that name {project.brand_name}</div>
          <div className="value">{pct(r.overall.rate)}</div>
          <div className="note">95% range <RangeText rate={r.overall} /></div>
        </div>
        <div className="tile">
          <div className="label">Change since previous run</div>
          {r.change ? (
            <>
              <div className={`value ${r.change.significant ? (r.change.delta > 0 ? "good" : "bad") : ""}`}>
                {r.change.delta >= 0 ? "+" : ""}{(r.change.delta * 100).toFixed(1)} pts
              </div>
              <div className="note">{r.change.significant ? "A real change (p < 0.05)" : "Within normal variation, not a real change yet"}</div>
            </>
          ) : (
            <><div className="value quiet">n/a</div><div className="note">Needs a second run</div></>
          )}
        </div>
        <div className="tile">
          <div className="label">Share of voice</div>
          <div className="value">{pct(selfBrand.shareOfVoice)}</div>
          <div className="note">of all brand mentions across tracked brands</div>
        </div>
        <div className="tile">
          <div className="label">Answers citing your website</div>
          <div className="value">{project.brand_domain ? pct(r.validAnswers ? cited / r.validAnswers : 0) : "–"}</div>
          <div className="note">{project.brand_domain ? `${cited} answers link to ${project.brand_domain}` : <Link href={`/p/${projectId}/setup`}>Set your domain</Link>}</div>
        </div>
      </div>

      <h2>By engine</h2>
      <div className="panel">
        <table>
          <thead>
            <tr><th>Engine</th><th>Named in</th><th></th><th className="num">95% range</th><th className="num">Avg. position</th><th className="num">Site cited</th><th>Tone when named</th></tr>
          </thead>
          <tbody>
            {r.engines.map((e) => (
              <tr key={e.engine}>
                <td>{engineLabel(e.engine)}{e.errors > 0 && <div className="warn">{e.errors} failed</div>}</td>
                <td className="num">{pct(e.mention.rate)}</td>
                <td><RateBar rate={e.mention} self /></td>
                <td className="num"><RangeText rate={e.mention} /></td>
                <td className="num">{e.avgPosition ? `#${e.avgPosition.toFixed(1)}` : "–"}</td>
                <td className="num">{pct(e.cited.rate)}</td>
                <td>
                  <span className="good">{e.sentiment.positive} positive</span> · {e.sentiment.neutral} neutral ·{" "}
                  <span className="bad">{e.sentiment.negative} negative</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>You vs competitors</h2>
      <div className="panel">
        <table>
          <thead><tr><th>Brand</th><th>Named in</th><th></th><th className="num">95% range</th><th className="num">Share of voice</th><th className="num">Avg. position</th></tr></thead>
          <tbody>
            {r.brands.map((b) => (
              <tr key={b.key}>
                <td>{b.isSelf ? <strong>{b.name}</strong> : b.name}</td>
                <td className="num">{pct(b.mention.rate)}</td>
                <td><RateBar rate={b.mention} self={b.isSelf} /></td>
                <td className="num"><RangeText rate={b.mention} /></td>
                <td className="num">{pct(b.shareOfVoice)}</td>
                <td className="num">{b.avgPosition ? `#${b.avgPosition.toFixed(1)}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Prompts where you are weakest</h2>
      <div className="panel">
        <table>
          <thead><tr><th>Prompt</th><th className="num">Named in</th>{r.run.engines.map((e) => <th key={e} className="num">{engineLabel(e)}</th>)}<th>Who AI names instead</th></tr></thead>
          <tbody>
            {r.prompts.map((p) => (
              <tr key={p.promptId}>
                <td><Link href={`/p/${projectId}/answers?prompt=${p.promptId}`}>{p.text}</Link>{p.topic && <div className="quiet">{p.topic}</div>}</td>
                <td className="num">{pct(p.mention.rate)}</td>
                {r.run.engines.map((e) => <td key={e} className="num">{p.byEngine[e].trials ? `${p.byEngine[e].successes}/${p.byEngine[e].trials}` : "–"}</td>)}
                <td>{p.competitorsSeen.map((c) => <span key={c.name} className="pill">{c.name} ×{c.count}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid2">
        <div>
          <h2>Sources to win</h2>
          <p className="quiet">Sites AI cites when it names a competitor but not you. Getting featured here is the fastest off-site win.</p>
          <div className="panel">
            <table>
              <thead><tr><th>Domain</th><th className="num">Answers without you</th><th className="num">All citing answers</th></tr></thead>
              <tbody>
                {r.sourceGaps.length === 0 && <tr><td colSpan={3} className="quiet">No gaps found in this run.</td></tr>}
                {r.sourceGaps.map((g) => (
                  <tr key={g.domain}><td>{g.domain}</td><td className="num">{g.gapAnswers}</td><td className="num">{g.totalAnswers}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Most cited sources</h2>
          <p className="quiet">Every domain the engines linked to in this run.</p>
          <div className="panel">
            <table>
              <thead><tr><th>Domain</th><th className="num">Answers</th></tr></thead>
              <tbody>
                {r.topDomains.map((d) => <tr key={d.domain}><td>{d.domain}</td><td className="num">{d.count}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2>Run again</h2>
      <p className="quiet">More samples give tighter ranges. Each sample is one paid API call per prompt per engine.</p>
      {runForm}
    </>
  );
}

function DemoNote() {
  return (
    <div className="callout">
      These numbers come from the <strong>demo engine</strong>, which simulates answers offline. Add API keys in <code>.env</code> (see <code>.env.example</code>) to track the real engines.
    </div>
  );
}
