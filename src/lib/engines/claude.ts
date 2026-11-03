import Anthropic from "@anthropic-ai/sdk";
import { dedupeCitations, domainOf } from "../analyze";
import type { Citation, Engine } from "../types";

/** Claude with the server-side web search tool. */
export const claude: Engine = {
  id: "claude",
  label: "Claude",
  isConfigured: () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  async ask(prompt, opts) {
    const client = new Anthropic();
    const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
    const webSearch: Anthropic.Messages.ToolUnion = {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 5,
      ...(opts.country ? { user_location: { type: "approximate" as const, country: opts.country } } : {}),
    } as Anthropic.Messages.ToolUnion;

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    let response: Anthropic.Message | undefined;
    // A long search can pause the turn; send the partial answer back to let it finish.
    for (let i = 0; i < 4; i++) {
      response = await client.messages.create({ model, max_tokens: 16000, messages, tools: [webSearch] });
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }
    if (!response) throw new Error("No response from Claude");
    if (response.stop_reason === "refusal") throw new Error("Claude declined to answer this prompt");

    let text = "";
    const citations: Citation[] = [];
    const searched: Citation[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") citations.push({ url: c.url, title: c.title ?? undefined, domain: domainOf(c.url) });
        }
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) searched.push({ url: r.url, title: r.title, domain: domainOf(r.url) });
      }
    }
    // Prefer the sources Claude actually cited; fall back to what it searched if it cited none.
    return { text, citations: dedupeCitations(citations.length ? citations : searched), model: response.model };
  },
};
