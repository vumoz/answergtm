import { dedupeCitations, domainOf } from "../analyze";
import type { Engine } from "../types";
import { postJson } from "./http";

interface SonarResponse {
  model?: string;
  choices: Array<{ message: { content: string } }>;
  citations?: string[];
  search_results?: Array<{ url: string; title?: string }>;
}

/** Perplexity Sonar API: answers are always grounded in live web results. */
export const perplexity: Engine = {
  id: "perplexity",
  label: "Perplexity",
  isConfigured: () => !!process.env.PERPLEXITY_API_KEY,
  async ask(prompt, opts) {
    const model = process.env.PERPLEXITY_MODEL || "sonar";
    const body: Record<string, unknown> = { model, messages: [{ role: "user", content: prompt }] };
    if (opts.country) body.web_search_options = { user_location: { country: opts.country } };
    const data = await postJson<SonarResponse>("https://api.perplexity.ai/chat/completions", body, {
      authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    });
    const fromResults = (data.search_results ?? []).map((r) => ({ url: r.url, title: r.title, domain: domainOf(r.url) }));
    const fromUrls = (data.citations ?? []).map((url) => ({ url, domain: domainOf(url) }));
    return {
      text: data.choices[0]?.message.content ?? "",
      citations: dedupeCitations([...fromResults, ...fromUrls]),
      model: data.model ?? model,
    };
  },
};
