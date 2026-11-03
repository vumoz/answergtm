import { dedupeCitations, domainOf } from "../analyze";
import type { Engine } from "../types";
import { getJson } from "./http";

interface TextBlock {
  type?: string;
  title?: string;
  snippet?: string;
  list?: TextBlock[];
  text_blocks?: TextBlock[];
}
interface AiOverview {
  page_token?: string;
  text_blocks?: TextBlock[];
  references?: Array<{ title?: string; link?: string; source?: string }>;
  error?: string;
}

function flatten(blocks: TextBlock[] = []): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.title) lines.push(b.title);
    if (b.snippet) lines.push(b.snippet);
    if (b.list) lines.push(...b.list.map((i) => `- ${[i.title, i.snippet].filter(Boolean).join(" ")}`));
    if (b.text_blocks) lines.push(flatten(b.text_blocks));
  }
  return lines.join("\n");
}

/** Google AI Overviews via SerpApi (Google has no official AI Overviews API). */
export const googleAio: Engine = {
  id: "google_aio",
  label: "Google AI Overviews",
  isConfigured: () => !!process.env.SERPAPI_API_KEY,
  async ask(prompt, opts) {
    const key = process.env.SERPAPI_API_KEY!;
    const params = new URLSearchParams({ engine: "google", q: prompt, hl: "en", api_key: key });
    if (opts.country) params.set("gl", opts.country.toLowerCase());
    const serp = await getJson<{ ai_overview?: AiOverview }>(`https://serpapi.com/search.json?${params}`);
    let aio = serp.ai_overview;
    if (aio?.page_token) {
      const more = new URLSearchParams({ engine: "google_ai_overview", page_token: aio.page_token, api_key: key });
      aio = (await getJson<{ ai_overview?: AiOverview }>(`https://serpapi.com/search.json?${more}`)).ai_overview;
    }
    if (!aio || aio.error) return { text: "", citations: [], model: "no AI Overview shown" };
    const citations = (aio.references ?? [])
      .filter((r) => r.link)
      .map((r) => ({ url: r.link!, title: r.title ?? r.source, domain: domainOf(r.link!) }));
    return { text: flatten(aio.text_blocks), citations: dedupeCitations(citations), model: "google-ai-overview" };
  },
};
