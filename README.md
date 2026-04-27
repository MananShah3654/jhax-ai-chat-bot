<div align="center">

# 🍔 JhaPay AI

**A conversational commerce assistant for restaurants, orders, wallet, and rewards.**

Provider-agnostic LLM chat with a guarded tool boundary, deterministic money-flow,
and a mobile-first UI in the spirit of Claude.

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Vercel-ready](https://img.shields.io/badge/deploy-vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![OpenAI-compat](https://img.shields.io/badge/LLM-OpenAI--compatible-412991?logo=openai&logoColor=white)](#-plug-in-any-model)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

</div>

---

## ✨ What it does

A chat interface that turns natural language into safe actions on a restaurant + wallet API:

- 🔍 **Discovery** — find restaurants, hours, menu items by price / dietary / day-part
- 🧾 **Ordering** — draft, modify, confirm, cancel; pickup or delivery
- 💳 **Payments** — wallet balance, recharge, split bill, QR pay, request, tip-and-close
- 🎁 **Rewards** — points, coupons, cashback, milestones, auto-apply best discount
- 🧠 **Smart AI** — order history, spend insights, personalized "you'd like this", group meal planning
- 🔒 **Guardrails** — sales counts, payroll, payment tokens, vendor data are never reachable

> The LLM only ever sees a small, audited tool surface — it cannot run raw SQL, see private business data, or pretend an order was placed.

---

## 🚀 Quick start

```bash
git clone <repo>
cd jhax-ai-chat-bot
npm install
cp .env.example .env       # then edit .env (see below)
npm run dev
```

Open <http://localhost:3000> and chat.

### Choose a model provider

Edit `.env` with one of these — any OpenAI-compatible endpoint works.

<details>
<summary><b>🆓 Groq (free, fastest, no credit card)</b></summary>

Sign up at <https://console.groq.com>:

```ini
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile
```
</details>

<details>
<summary><b>🆓 OpenRouter free-tier (one key, many models)</b></summary>

Sign up at <https://openrouter.ai/keys>, browse `:free` models at <https://openrouter.ai/models?max_price=0>:

```ini
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=meta-llama/llama-3.3-70b-instruct:free
```
</details>

<details>
<summary><b>🆓 Google Gemini free tier</b></summary>

Get a key at <https://aistudio.google.com/apikey>:

```ini
OPENAI_API_KEY=AIza...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-2.0-flash
```
</details>

<details>
<summary><b>💰 OpenAI direct</b></summary>

```ini
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```
</details>

<details>
<summary><b>🖥️ Local Ollama / vLLM / LM Studio</b></summary>

```ini
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3.1
```
</details>

> Without an API key, the demo still works — it falls back to a deterministic local responder.

---

## 🏗️ Architecture

```text
                     ┌──────────────────────────┐
                     │   Mobile / Web Client    │
                     │   (Claude-style UI)      │
                     └────────────┬─────────────┘
                                  │ HTTPS / SSE
                                  ▼
                     ┌──────────────────────────┐
                     │  Restaurant AI API       │   src/server.js
                     │  CORS · streaming · log  │
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │  AI Brain                │   src/aiBrain.js
                     │  ├── Intent router       │     deterministic for money/order
                     │  ├── Scope guard prompt  │     refuses creative / off-topic
                     │  └── LLM dispatcher      │     OpenAI-compatible fetch
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │  MCP Tool Engine         │   src/mcpEngine.js
                     │  audited tool surface    │   20+ JSON-schema'd tools
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │  Data Layer              │   src/db.js
                     │  Postgres or in-memory   │
                     └──────────────────────────┘
```

### Where the LLM is — and isn't

The brain is **hybrid by design**:

| Path | Handler | Why |
|---|---|---|
| Free-form discovery, menu, payments-info, rewards, smart-AI | **LLM** with retrieved RAG context | Natural language is the value-add |
| Order state (draft / confirm / cancel) | **Deterministic** regex + tool execution | Money and "is the order placed?" must never hallucinate |
| Blocked categories (sales, payroll, tokens) | **Deterministic refusal** | Never reaches the model |

This split lives in [`shouldUseDeterministicReply()`](src/aiBrain.js#L830) gated by `RAG_ELIGIBLE_INTENTS`.

---

## 🔌 Plug in any model

The LLM call is one `fetch` to an OpenAI-compatible endpoint. Swap the provider with two env vars — **no code change**.

```js
// src/aiBrain.js (excerpt)
fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    temperature: 0,
    messages: [...]
  })
});
```

This works because every modern provider speaks OpenAI's `/v1/chat/completions` schema — Groq, OpenRouter, Together, Fireworks, Cerebras, Anyscale, Ollama, vLLM, LM Studio, and OpenAI itself.

> 📄 See [docs/architecture-decisions.md](#-why-no-langchain--langgraph) for why we don't add LangChain on top.

---

## 🛡️ AI tool surface (the security perimeter)

The model can **only** invoke functions from this allow-list. There is no path to raw SQL, no path to private business data.

```text
Discovery:    list_restaurants · search_menu
Ordering:     create_order_draft · confirm_order · cancel_order · get_order
Rewards:      get_rewards_summary · apply_best_rewards · get_cashback_offers
Wallet:       recharge_wallet · split_bill · create_qr_payment · request_payment
              pay_invoice · tip_and_close
History:      get_transaction_history · get_spend_insights · get_order_history
              reorder_last_order · get_receipts
Smart AI:     get_personalized_recommendations · save_deal_alert
```

Tools the model **cannot** call (because they don't exist on the tool surface):
**sales reports · payroll · payment tokens · vendor contracts · admin · raw SQL**

If the tool doesn't exist, the AI cannot use it. ✅

---

## 📱 Mobile UI

The chat is designed mobile-first in the spirit of Claude's mobile app:

- Sidebar-toggle icon (hamburger replaced) opens a slim drawer
- Drawer rows: New chat · End chat · Pickup location · Modes
- Modes accordion: Discovery · Ordering · Payments · Rewards · Smart AI
- Composer card with `+` (left) and circular send (right)
- Disclaimer line ("AI can make mistakes")
- Serif typography for assistant prose, light-gray pill for user
- Warm neutral palette · zero shadows · subtle borders

Files: [`public/index.html`](public/index.html) · [`public/styles.css`](public/styles.css) · [`public/app.js`](public/app.js)

---

## 📡 API surface

```text
GET  /api/health
GET  /api/restaurants
GET  /api/menu/search
POST /api/chat                    JSON request / response
POST /api/chat/stream             SSE token stream
POST /api/orders/draft
POST /api/orders/{id}/confirm
POST /api/orders/{id}/cancel
GET  /api/orders/{id}
GET  /api/mcp/tools               tool registry introspection
```

### Example request

```bash
curl -s http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"what cheap eats do you have under 10 dollars?"}'
```

```jsonc
{
  "sessionId": "...",
  "reply": "Here are some cheap eats under $10: ...",
  "context": {
    "intent": "menu_answer",
    "menuItems": [...]
  }
}
```

---

## 🧪 Smoke test

```bash
npm run smoke
```

Verifies:

- ✅ Restaurant catalog loaded (10 locations: 3 real + 7 demo)
- ✅ Demand-aware taco ranking
- ✅ Tacos-only filter (popular burgers don't leak in)
- ✅ Multi-item draft order
- ✅ Customer-friendly order id
- ✅ Confirmed order status
- ✅ JhaPay wallet remaining balance
- ✅ Estimated pickup time

---

## 🐘 Run with Postgres (optional)

```bash
docker compose up -d
```

Add to `.env`:

```ini
DATABASE_URL=postgres://ai_app:ai_demo_password@localhost:5432/olympic_ai_demo
```

The data layer is split into two zones — the AI-facing role only sees the **safe** zone:

```text
🟢  safe AI zone                 🔴  private back-office zone
    restaurants                       sales reports
    menu categories                   payroll
    menu items                        payment tokens
    item availability                 vendor contracts
    orders / order_items
    tool audit log
```

Same Postgres database, different role permissions.

---

## 🧠 Why no LangChain / LangGraph

Short version: **the OpenAI-compatible endpoint already gives us provider-swap freedom for free**, and our chat is a linear pipeline — adding a state-graph DSL doesn't reduce code, it adds boilerplate.

| What we'd gain | What we'd pay |
|---|---|
| Memory primitives | ~5–10 MB of deps · 150–250 ms cold-start tax |
| Prebuilt tool-call loop (~50 lines we'd otherwise write) | LangChain's frequent breaking major versions |
| Real streaming abstraction | Loss of one-fetch cost transparency |
| LangSmith tracing | Lock-in to LangChain's tool format |

LangGraph's leverage is on **multi-agent** workloads (handoffs, parallel branches, supervisor patterns). We have one assistant, one turn. It's the wrong abstraction for our shape.

**Reconsider when:** multi-step agentic planning, agent-to-agent handoffs, cross-provider feature blending, or LangSmith-grade evals become real needs. Until then, a hand-written pipeline is faster, cheaper, more debuggable, and provider-agnostic in a way the framework actively isn't.

---

## 🎁 Bonus: scope-guarded prompt

The system prompt restricts the model to JhaPay-only topics with a fixed refusal template — see [`BASE_SYSTEM_PROMPT`](src/aiBrain.js#L57).

```text
SCOPE — you only answer questions about:
- JhaPay restaurants, locations, hours, menus, prices
- Orders (draft, modify, confirm, cancel, status, history)
- JhaPay wallet (balance, recharge, pay, split, QR, request)
- Rewards (points, coupons, cashback, milestones, discounts)

REFUSE everything else (poems, jokes, code, math, world knowledge,
role-play). Reply with exactly:
"I can only help with JhaPay restaurants, orders, wallet, and rewards.
What can I help you with there?"
```

---

## 🗂️ Project layout

```text
jhax-ai-chat-bot/
├── api/[...path].js          # Vercel handler (defers to src/server)
├── public/
│   ├── index.html            # Chat UI shell
│   ├── styles.css            # Mobile-first Claude-style theme
│   └── app.js                # Streaming chat + drawer + accordion
├── src/
│   ├── server.js             # HTTP + SSE + routing
│   ├── aiBrain.js            # Intent · scope guard · LLM dispatch
│   ├── mcpEngine.js          # 20+ JSON-schema'd tools
│   ├── rag.js                # Pillar-scoped context retrieval
│   ├── db.js                 # Postgres / in-memory store
│   ├── demoData.js           # Seed restaurants + menu items
│   └── smoke-test.js         # End-to-end smoke suite
├── .env.example              # Provider configs (free + paid options)
└── vercel.json               # Vercel routing
```

---

## 🚢 Production upgrade path

Before shipping for real, replace the demo stubs with:

- 🔐 Real auth (customer identity + session)
- 🛒 Real POS provider (keep `create_order_draft` / `confirm_order` contracts stable)
- 💳 Real payment / wallet provider
- 📋 Real menu source (probably your existing CMS or POS feed)
- 🗄️ Shared session store (Redis)
- 🚦 API auth + rate limiting
- 📊 Observability (OpenTelemetry traces, error tracking)
- 📜 Audit dashboards (the tool audit log is already wired)
- 🚀 CI/CD pipeline

---

## 📦 Demo data

Real public locations represented: **Hesperia · Torrance · Colton**

Demo locations (synthetic): Anaheim · Riverside · Pasadena · Long Beach · Irvine · Ontario · San Diego

Menu spans breakfast · burgers · combos · Mexican · sandwiches · sides · kids meals · drinks. Inspired by public Olympic Flame Burgers data.

---

## License

MIT — see [LICENSE](LICENSE) (add one if you don't have it yet).

---

<div align="center">

**Built as a reference architecture for AI-safe restaurant commerce.**

If this helped, ⭐ the repo. PRs welcome.

</div>
