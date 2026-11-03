import { dedupeCitations, domainOf } from "../analyze";
import type { Engine } from "../types";
import { postJson } from "./http";

interface ResponsesOutput {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string; title?: string }>;
    }>;
  }>;
}

/** ChatGPT-style answers: OpenAI Responses API with the web search tool switched on. */
export const chatgpt: Engine = {
  id: "chatgpt",
  label: "ChatGPT",
  isConfigured: () => !!process.env.OPENAI_API_KEY,
  async ask(prompt, opts) {
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const tool: Record<string, unknown> = { type: "web_search" };
    if (opts.country) tool.user_location = { type: "approximate", country: opts.country };
    const data = await postJson<ResponsesOutput>(
      "https://api.openai.com/v1/responses",
      { model, input: prompt, tools: [tool] },
      { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    );
    let text = "";
    const citations = [];
    for (const item of data.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) {
        if (part.type !== "output_text") continue;
        text += part.text ?? "";
        for (const a of part.annotations ?? []) {
          if (a.type === "url_citation" && a.url) citations.push({ url: a.url, title: a.title, domain: domainOf(a.url) });
        }
      }
    }
    return { text, citations: dedupeCitations(citations), model: data.model ?? model };
  },
};
