# AI Visibility Tracker

Phase 1 of the AI search visibility platform: measure how often AI answer engines name and cite your brand, compared with competitors, with honest confidence ranges.

It asks your buyer prompts on **ChatGPT, Perplexity, Gemini, Google AI Overviews and Claude**, several times each, stores every answer, and reports:

- **Mention rate** with a 95% range (Wilson interval), overall and per engine
- **Change since the last run**, flagged as real only when it beats random variation (two-proportion z-test)
- **Share of voice** and average position against each competitor
- **Weakest prompts** and which competitors AI names instead
- **Sources to win**: sites AI cites when it names a competitor but not you
- **Every raw answer** with its sources, so any number can be checked

## Quick start

Needs Node 22.5 or newer (uses the built-in `node:sqlite`).

```bash
npm install
npm run seed          # creates the BioNature Bloom project with competitors and 12 prompts
npm run track         # one tracking round (demo engine if no API keys are set)
npm run dev           # dashboard at http://localhost:3000
```

With no API keys the app uses a **demo engine** that simulates answers offline, so you can try the dashboard. Its numbers say nothing about real AI engines.

## Connecting real engines

Copy `.env.example` to `.env` and add a key for each engine you want:

| Engine | Key | How it's queried |
| --- | --- | --- |
| ChatGPT | `OPENAI_API_KEY` | OpenAI Responses API with web search |
| Perplexity | `PERPLEXITY_API_KEY` | Sonar API |
| Gemini | `GEMINI_API_KEY` | Gemini API with Google Search grounding |
| Google AI Overviews | `SERPAPI_API_KEY` | SerpApi (Google has no official API) |
| Claude | `ANTHROPIC_API_KEY` | Messages API with web search |

API answers can differ from what people see in the consumer apps (personalisation, location, app-only features). Treat the numbers as a consistent benchmark to track over time.

**Cost:** each run makes `prompts × engines × samples` calls. 12 prompts × 5 engines × 3 samples = 180 calls.

## Commands

```bash
npm run track -- --project 1 --samples 5 --engines chatgpt,perplexity
npm test              # unit tests (stats, answer parsing, runner)
npm run typecheck
npm run build && npm start
```

Add your website (for example `bionaturebloom.com`) under **Prompts and competitors → Your brand**, or set `BRAND_DOMAIN` before `npm run seed`. The tracker uses it to spot when an AI answer links to your own site.

## How it works

```
src/lib/engines/   one connector per AI engine, plus the demo engine
src/lib/analyze.ts finds brand mentions, position, sentiment and cited domains in an answer
src/lib/stats.ts   Wilson intervals and the significance test for changes
src/lib/runner.ts  runs prompts × engines × samples with retries and stores answers
src/lib/report.ts  turns stored answers into the dashboard numbers
src/lib/db.ts      SQLite storage (data/tracker.db)
app/               Next.js dashboard
```

## Roadmap

1. **Measure** (this release): prompt tracking, scores with ranges, competitor and source views
2. **Diagnose + Fix**: AI readiness audit (crawlers, schema, product feed) and a fix studio with a claim-compliance check for supplement copy
3. **Prove**: GA4 and Shopify connection for AI-referral traffic and revenue
4. **Scale**: off-site playbook, accuracy alerts, agency workspaces, billing
