"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkCopyAction } from "./actions";
import type { ComplianceResult } from "@/lib/compliance";

export function SubmitButton({ children, pending, className }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} className={className}>
      {busy ? pending ?? "Working…" : children}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function ComplianceIssues({ result }: { result: ComplianceResult }) {
  if (result.verdict === "ok") return <p className="good">No claim problems found.</p>;
  return (
    <ul className="issues">
      {result.issues.map((i, n) => (
        <li key={n} className={i.severity === "block" ? "bad" : "warn"}>
          <strong>{i.severity === "block" ? "Must fix" : "Review"}: {i.rule}</strong>
          {i.match && <> on “{i.match}”</>}
          <div className="quiet">{i.why}</div>
          <div>Try: {i.suggestion}</div>
        </li>
      ))}
    </ul>
  );
}

export function ClaimChecker() {
  const [result, action] = useActionState(checkCopyAction, null);
  return (
    <form action={action}>
      <textarea name="copy" rows={6} style={{ width: "100%" }} placeholder="Paste an ad, landing page section, email or product description" />
      <div style={{ marginTop: 8 }}>
        <SubmitButton pending="Checking…">Check claims</SubmitButton>
      </div>
      {result && (
        <div style={{ marginTop: 12 }}>
          <ComplianceIssues result={result} />
        </div>
      )}
    </form>
  );
}
