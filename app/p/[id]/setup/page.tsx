import { addCompetitorAction, addPromptAction, deleteCompetitorAction, togglePromptAction } from "@app/actions";
import { getProject, listCompetitors, listPrompts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Setup({ params }: { params: Promise<{ id: string }> }) {
  const projectId = Number((await params).id);
  const project = getProject(projectId)!;
  const prompts = listPrompts(projectId);
  const competitors = listCompetitors(projectId);

  return (
    <>
      <h1>Prompts and competitors</h1>
      <p className="sub">
        Track the questions real buyers ask. We look for {project.brand_name}
        {project.brand_aliases.length > 0 && ` (also "${project.brand_aliases.join('", "')}")`} and every competitor below in each answer.
      </p>

      <h2>Prompts ({prompts.filter((p) => p.active).length} active)</h2>
      <div className="panel">
        <table>
          <tbody>
            {prompts.map((p) => (
              <tr key={p.id}>
                <td className={p.active ? "" : "quiet"}>{p.text}</td>
                <td className="quiet">{p.topic}</td>
                <td className="num">
                  <form action={togglePromptAction.bind(null, projectId, p.id, !p.active)}>
                    <button className="secondary" type="submit">{p.active ? "Pause" : "Resume"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addPromptAction.bind(null, projectId)} style={{ marginTop: 12 }}>
        <textarea name="prompts" rows={4} cols={70} placeholder="One prompt per line, e.g. What is the best supplement for bloating?" required />
        <div className="inline" style={{ marginTop: 8 }}>
          <input name="topic" placeholder="Topic (optional)" />
          <button type="submit">Add prompts</button>
        </div>
      </form>

      <h2>Competitors</h2>
      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Website</th><th>Other names</th><th></th></tr></thead>
          <tbody>
            {competitors.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="quiet">{c.domain}</td>
                <td className="quiet">{c.aliases.join(", ")}</td>
                <td className="num">
                  <form action={deleteCompetitorAction.bind(null, projectId, c.id)}>
                    <button className="secondary" type="submit">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addCompetitorAction.bind(null, projectId)} className="inline" style={{ marginTop: 12 }}>
        <input name="name" placeholder="Competitor name" required />
        <input name="domain" placeholder="Website" />
        <input name="aliases" placeholder="Other names, comma separated" />
        <button type="submit">Add competitor</button>
      </form>
    </>
  );
}
