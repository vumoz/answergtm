/** The AI crawlers that decide whether a site can show up in AI answers. */
export const AI_BOTS = [
  { agent: "OAI-SearchBot", owner: "ChatGPT search", role: "search" },
  { agent: "ChatGPT-User", owner: "ChatGPT browsing", role: "search" },
  { agent: "GPTBot", owner: "OpenAI training", role: "training" },
  { agent: "PerplexityBot", owner: "Perplexity", role: "search" },
  { agent: "Claude-SearchBot", owner: "Claude search", role: "search" },
  { agent: "ClaudeBot", owner: "Anthropic training", role: "training" },
  { agent: "Google-Extended", owner: "Gemini and Google AI", role: "training" },
  { agent: "Googlebot", owner: "Google Search and AI Overviews", role: "search" },
  { agent: "Bingbot", owner: "Bing and Copilot", role: "search" },
  { agent: "Applebot-Extended", owner: "Apple Intelligence", role: "training" },
] as const;

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export interface Robots {
  groups: Group[];
  sitemaps: string[];
}

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      // An empty Disallow means "allow everything".
      if (key === "disallow" && value === "") continue;
      current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function pathMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const pattern = rule
    .replace(/\$$/, "")
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest-match rule evaluation, as Google and most AI crawlers apply it. */
export function isAllowed(robots: Robots, agent: string, path = "/"): boolean {
  const a = agent.toLowerCase();
  let group = robots.groups.find((g) => g.agents.includes(a));
  group ??= robots.groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!pathMatches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}
