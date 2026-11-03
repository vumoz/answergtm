import { dedupeCitations, domainOf } from "../analyze";
import type { Citation, Engine } from "../types";
import { postJson } from "./http";

interface GeminiResponse {
  modelVersion?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
}

/** Gemini with Google Search grounding. */
export const gemini: Engine = {
  id: "gemini",
  label: "Gemini",
  isConfigured: () => !!process.env.GEMINI_API_KEY,
  async ask(prompt) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const data = await postJson<GeminiResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] },
      { "x-goog-api-key": process.env.GEMINI_API_KEY! },
    );
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const citations: Citation[] = [];
    for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri;
      if (!uri) continue;
      // Grounding URIs are Google redirect links; the title carries the source's domain.
      const host = domainOf(uri);
      const domain = host.includes("vertexaisearch") && chunk.web?.title ? domainOf(chunk.web.title) : host;
      citations.push({ url: uri, title: chunk.web?.title, domain });
    }
    return { text, citations: dedupeCitations(citations), model: data.modelVersion ?? model };
  },
};
