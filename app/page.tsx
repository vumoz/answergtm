import Link from "next/link";
import { createProjectAction } from "./actions";
import { listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const projects = listProjects();
  return (
    <>
      <header className="top">
        <Link href="/" className="logo">AI Visibility Tracker</Link>
      </header>
      <main>
        <h1>Brands</h1>
        <p className="sub">Pick a brand to see how AI answer engines talk about it.</p>
        {projects.length > 0 && (
          <div className="panel">
            <table>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/p/${p.id}`}>{p.brand_name}</Link></td>
                    <td className="quiet">{p.brand_domain ?? "no domain set"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2>Add a brand</h2>
        <form action={createProjectAction} className="inline">
          <input name="brandName" placeholder="Brand name" required />
          <input name="brandDomain" placeholder="Website, e.g. example.com" />
          <input name="aliases" placeholder="Other names, comma separated" />
          <input name="country" placeholder="Country code, e.g. US" size={14} />
          <button type="submit">Create</button>
        </form>
      </main>
    </>
  );
}
