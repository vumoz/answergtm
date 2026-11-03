/**
 * Statistics helpers. AI answers vary between runs, so every rate we show
 * comes with a confidence range, and changes are only flagged when they are
 * larger than what random variation would explain.
 */

export interface Rate {
  successes: number;
  trials: number;
  rate: number; // 0..1
  low: number; // 95% Wilson interval
  high: number;
}

const Z95 = 1.959963984540054;

/** Wilson score interval: well-behaved for small samples and rates near 0 or 1. */
export function wilson(successes: number, trials: number, z = Z95): Rate {
  if (trials <= 0) return { successes: 0, trials: 0, rate: 0, low: 0, high: 0 };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;
  return {
    successes,
    trials,
    rate: p,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

export interface Change {
  before: Rate;
  after: Rate;
  delta: number; // after.rate - before.rate
  pValue: number;
  /** True when the change is unlikely to be noise (two-sided p < 0.05). */
  significant: boolean;
}

/** Two-proportion z-test between two runs. */
export function compareRates(before: Rate, after: Rate): Change {
  const delta = after.rate - before.rate;
  const n1 = before.trials;
  const n2 = after.trials;
  if (n1 === 0 || n2 === 0) {
    return { before, after, delta, pValue: 1, significant: false };
  }
  const pooled = (before.successes + after.successes) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { before, after, delta, pValue: delta === 0 ? 1 : 0, significant: delta !== 0 };
  const z = delta / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { before, after, delta, pValue, significant: pValue < 0.05 };
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
