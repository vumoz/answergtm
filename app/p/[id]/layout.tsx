import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getProject } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) notFound();
  return (
    <>
      <header className="top">
        <Link href="/" className="logo">AI Visibility Tracker</Link>
        <strong>{project.brand_name}</strong>
        <nav>
          <Link href={`/p/${id}`}>Overview</Link>
          <Link href={`/p/${id}/answers`}>Answers</Link>
          <Link href={`/p/${id}/setup`}>Prompts and competitors</Link>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
