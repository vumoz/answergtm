import type { Rate } from "@/lib/stats";
import { pct } from "@/lib/stats";
import { engineById } from "@/lib/engines";

export function engineLabel(id: string) {
  return engineById(id)?.label ?? id;
}

/** Bar for a rate with its 95% range drawn as a thin line. */
export function RateBar({ rate, self = false }: { rate: Rate; self?: boolean }) {
  return (
    <div className={`bar${self ? " self" : ""}`} title={`${pct(rate.rate)} (95% range ${pct(rate.low)} to ${pct(rate.high)})`}>
      <div className="fill" style={{ width: `${rate.rate * 100}%` }} />
      <div className="ci" style={{ left: `${rate.low * 100}%`, width: `${Math.max(0.5, (rate.high - rate.low) * 100)}%` }} />
    </div>
  );
}

export function RangeText({ rate }: { rate: Rate }) {
  return (
    <span className="quiet">
      {pct(rate.low)} to {pct(rate.high)}
    </span>
  );
}
