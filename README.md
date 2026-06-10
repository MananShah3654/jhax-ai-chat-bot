<div align="center">

# 🍔✈️🏨 JhaPay AI

**A conversational commerce assistant for food, wallet, rewards, flights, and hotels.**

Provider-agnostic LLM chat with a guarded tool boundary, real US flight search via
Duffel, real US hotel discovery via Google Places (with 10-photo gallery per hotel),
multi-passenger booking, voice input, and a mobile-first UI in the spirit of Claude.

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Vercel-ready](https://img.shields.io/badge/deploy-vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![LLM](https://img.shields.io/badge/LLM-Claude%20%7C%20Groq%20%7C%20OpenAI%20%7C%20Gemini-412991)](#-plug-in-any-model)
[![Duffel](https://img.shields.io/badge/flights-Duffel-1A1A1A)](#-flight-booking-via-duffel-sandbox)
[![Places](https://img.shields.io/badge/hotels-Google%20Places-4285F4?logo=google&logoColor=white)](#-hotel-booking-via-google-places)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

</div>

---

## ✨ What it does

A chat interface that turns natural language into safe actions across two domains:

### 🍔 Food & commerce (in-memory demo data)

- 🔍 **Discovery** — restaurants, hours, menu items by price / dietary / day-part
- 🧾 **Ordering** — draft, modify, confirm, cancel; pickup or delivery
- 💳 **Payments** — wallet balance, recharge, split bill, QR pay, request, tip-and-close
- 🎁 **Rewards** — points, coupons, cashback, milestones, auto-apply best discount
- 🧠 **Smart AI** — order history, spend insights, personalized recs, group meal planning

### ✈️ Flight booking (real Duffel sandbox)

- 🌐 **Real US flight search** — natural language: *"flights from LAX to JFK for 2 people on 23 june"*
- 🎫 **Kayak-style flight cards** with airline, route, depart/arrive, stops, price, Select
- 👥 **Multi-passenger management** — inline editor with Edit / Remove / + Add passenger, modal form with real `<input type="date">` for DOB
- 💸 **Draft → Confirm flow** with JhaPay wallet split panel and mock PNR on confirmation
- 🔁 **Fare auto-scales** per-passenger when you add or remove travelers
- 🚦 **Confirm gate** — disabled until every passenger has name + DOB

### 🏨 Hotel booking (real Google Places + simulated pricing)

- 🌐 **Real US hotel data** — natural language: *"hotels in san francisco from june 24 to june 26"*
- 📸 **10-photo lightbox gallery** per hotel — tap card photo to open swipeable fullscreen carousel
- ⭐ **Real ratings & reviews** from Google (4.3 ★, 1.2K reviews) on every card
- 🛏️ **Hotel cards** with photo, name, rating pill, address, amenities, $/night + total + Select
- 🛒 **Draft → Confirm flow** with stay grid (check-in / out / guests / nights), fare breakdown, JhaPay wallet split, mock reservation ID
- 💲 **Deterministic pricing simulation** — same hotel always gets the same price (city base × price level × rating bump × hashed variance)

### 🎙️ Voice input + 📱 mobile UI

- Voice input via Web Speech API — tap mic, speak, 3s of silence auto-submits
- Mic ↔ Send swap as you type (ChatGPT/Claude mobile pattern)
- Single-button-at-a-time composer, dark-filled Send/Mic, light surface for typing
- Drawer with sidebar-toggle icon, prompt-mode accordion, "Listening…" pill

### 🔒 Guardrails

- Sales counts, payroll, payment tokens, vendor data are **never reachable**
- LLM only sees a small, audited tool surface — no raw SQL, no private business data
- **Creative-format pre-filter** (regex) blocks haiku / poem / song / rap **before** the LLM call
- Off-topic refusal template: *"I can only help with JhaPay restaurants, orders, wallet, rewards, and travel bookings."*

> The LLM cannot pretend an order was placed, hallucinate a flight number, or invent a PNR — every money-touching path is deterministic regex + tool execution.

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

Edit `.env` with **one** of these — without an API key the demo falls back to a deterministic local responder.

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
<summary><b>🧠 Anthropic Claude (native API, $5 free credit on signup)</b></summary>

Get a key at <https://console.anthropic.com/settings/keys>:

```ini
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

Other models: `claude-sonnet-4-6`, `claude-opus-4-7`.

The native dispatcher uses the Anthropic Messages API directly — no OpenRouter middleman.
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
<summary><b>🆓 Google Gemini free tier</b></summary>

Get a key at <https://aistudio.google.com/apikey>:

```ini
OPENAI_API_KEY=AIza...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-2.0-flash
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

### Add Duffel for real flight search (optional)

Without it, the chat still works for food / wallet / rewards. Flight queries will return an empty result.

```ini
DUFFEL_ACCESS_TOKEN=duffel_test_...
```

Get a sandbox key at <https://duffel.com> — instant, no card. Production switch is `duffel_live_*` (requires verification).

### Add Google Places for real hotel discovery (optional)

Without it, hotel queries will return an error. With it, hotel cards render with **real US hotels, ratings, addresses, and 10 photos each**.

```ini
GOOGLE_PLACES_API_KEY=AIza...
```

Get a key at <https://console.cloud.google.com> → enable **Places API (New)** → create a key. Free up to **$200/month credit** which covers thousands of searches. ⚠️ Requires a card on file (Google verifies but doesn't charge until you exceed the credit).

If you see `Google Places 403`, the Places API isn't enabled yet — visit the link in the error message and click Enable, then wait ~60s for propagation.

---

## 🏗️ Architecture

```text
                     ┌──────────────────────────┐
                     │   Mobile / Web Client    │
                     │   (Claude-style UI)      │
                     │   + Voice input          │
                     └────────────┬─────────────┘
                                  │ HTTPS / SSE
                                  ▼
                     ┌──────────────────────────┐
                     │  Restaurant + Travel API │   src/server.js
                     │  CORS · streaming · log  │
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │  AI Brain                │   src/aiBrain.js
                     │  ├── Intent router       │     6 pillars + regex predicates
                     │  ├── Scope guard         │     creative-format pre-filter
                     │  └── LLM dispatcher      │     Anthropic OR OpenAI-compat
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │  MCP Tool Engine         │   src/mcpEngine.js
                     │  audited tool surface    │   ~22 JSON-schema'd tools
                     └───┬──────────┬──────────┬┘
                         ▼          ▼          ▼
       ┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
       │  Data Layer      │ │  Duffel     │ │  Google Places   │
       │  Postgres or     │ │  sandbox    │ │  (New) Text      │
       │  in-memory store │ │  US flights │ │  Search — US     │
       └──────────────────┘ │ + bookings  │ │  hotel discovery │
                            └─────────────┘ │  + 10 photos     │
                            src/duffel.js   └──────────────────┘
                                            src/googlePlaces.js
```

### Where the LLM is — and isn't

The brain is **hybrid by design**:

| Path | Handler | Why |
|---|---|---|
| Free-form discovery / menu / payments-info / rewards / smart-AI | **LLM** with retrieved RAG context | Natural language is the value-add |
| Travel slot extraction (flights & hotels) | **Regex + parsers** | Deterministic, structured, multi-turn aware |
| Flight search | **Regex + Duffel sandbox** | Real airline data |
| Hotel search | **Regex + Google Places (New)** | Real US hotel data + photos |
| Travel narration & slot-fill prompts | **LLM** | Polished phrasing |
| Order state (draft / confirm / cancel) — food, flight, **and hotel** | **Deterministic** regex + tool execution | Money and PNRs must never hallucinate |
| Blocked categories (sales, payroll, tokens) | **Deterministic refusal** | Never reaches the model |
| Creative formats (haiku, poem, rap, song) | **Regex pre-filter** | 100% reliable; doesn't waste an LLM round-trip |

---

## ✈️ Flight booking via Duffel sandbox

The travel pillar implements an end-to-end flow that mirrors the food order pattern.

### What "real" means

| What's real | What's not |
|---|---|
| ✅ Real Duffel API calls every search | ❌ Sandbox inventory — bookings don't issue actual tickets |
| ✅ Real airlines: AA, DL, UA, BA, Iberia, etc. | ❌ "Duffel Airways (ZZ)" is synthetic |
| ✅ Real prices in market range | ❌ Sandbox virtual clock runs ~6 weeks ahead of real time |
| ✅ Real response shape (offers, slices, segments, baggage, conditions) | ❌ PNR is a mock `JHA######` |
| ✅ Production switch is a token swap | |

### Conversation flow

```text
User: "flights from lax to jfk for 2 people on 23 june"
  → 4 flight cards render in chat (airline, route, duration, stops, price)

User: [taps Select on card 2]
  → That card highlights (dark aside, "Selected"), siblings dim to 50%
  → Draft booking card appears with:
      • Header + DRAFT badge + gold top bar
      • Flight summary (airline, depart/arrive times, cabin class)
      • Passenger 1: Manan Shah ✅      (Edit)
      • Passenger 2: empty ❌ "Needs details"      (Fill in / Remove)
      • + Add passenger
      • Fare breakdown: base + taxes + total (2 × per-pax)
      • Conditions: carry-on, checked bag, refundable
      • JhaPay Wallet: balance / total / remaining
      • [Cancel]    [Confirm & pay] ← disabled until pax 2 is valid

User: [taps "Fill in" on passenger 2]
  → Modal form: First name, Last name, DOB (real <input type="date">),
                Email, Phone

User: [saves]
  → Modal closes, fare auto-scales, Confirm enables

User: [taps Confirm & pay]
  → Confirmed card with PNR JHAU9ZZC, status badge flips green,
    wallet deducted, "Check-in opens 24 hours before departure"
```

### Slot extraction (`src/travelParse.js`)

Pure JavaScript, no external date libraries. Handles:

| Input | Parsed |
|---|---|
| `"lax to jfk"` | LAX → JFK (lowercase IATA codes) |
| `"los angeles to new york"` | LAX → JFK (city-name resolution) |
| `"tomorrow"`, `"next Friday"`, `"this weekend"`, `"in 3 days"` | Relative dates |
| `"23 june"`, `"june 23"`, `"23rd jun"` | Day-month or month-day order |
| `"2026-06-23"`, `"23/6"`, `"6/23"` | ISO + numeric (smart disambiguation: if first number > 12 it's the day) |
| `"for 2 people"`, `"3 adults"` | Passenger count (≤ 9) |
| `"business class"`, `"premium economy"` | Cabin class |

City → IATA map covers **33 major US airports** (JFK, LGA, EWR, LAX, SFO, ORD, MDW, DFW, IAH, MIA, FLL, BOS, SEA, DEN, ATL, LAS, DCA, IAD, PHX, PHL, DTW, MCO, AUS, PDX, BNA, MSP, TPA, SAN, CLT, BWI, SLC, HNL, plus aliases for "NYC", "LA", "SF", "vegas", "philly", etc.).

---

## 🏨 Hotel booking via Google Places

Real US hotel data from Google's Places API (New) with simulated pricing. Same chat flow as flights.

### What "real" means

| What's real | What's not |
|---|---|
| ✅ Real Google Places API calls every search | ❌ No live booking — Google doesn't expose a booking API |
| ✅ Real hotel names, addresses, ★ ratings, review counts | ❌ Nightly rates are simulated (Places doesn't return prices) |
| ✅ Real Google-served photos (up to 10 per hotel) | ❌ Confirmed reservation ID is a mock `JHA######` |
| ✅ priceLevel from Places informs the simulation | ❌ Availability isn't checked (every hotel is "available") |
| ✅ Free up to $200/mo Google Cloud credit | |

### Conversation flow

```text
User: "hotels in san francisco from june 24 to june 26"
  → 4-6 hotel cards render in chat:
      Photo (clickable!) · Name · ★ rating (review count)
      Address · Top 3 amenities
      $X/night · $Y total for N nights · [Select]

User: [taps any hotel photo]
  → Fullscreen lightbox opens
  → Swipe / arrow keys / click ‹ › through up to 10 photos
  → Counter "1 / 10" updates as you scroll
  → ESC or tap outside closes

User: [taps Select on Marriott Marquis]
  → That card highlights, siblings dim
  → Draft hotel booking card renders with:
      • Header + DRAFT badge + gold top bar
      • Reservation summary: hotel photo + ★ rating + address
      • Stay grid: Check-in · Check-out · Guests · Nights
      • Fare breakdown: $/night × N nights + taxes & fees
      • Conditions: amenities + cancellation policy
      • JhaPay Wallet: balance / total / remaining
      • [Cancel]    [Confirm & pay]

User: [taps Confirm & pay]
  → Confirmed card: "Reservation JHA1XEU9" pill
  → Status badge → green CONFIRMED
  → Wallet deducted
  → "Check-in opens at 3 PM on Jun 24. Confirmation email on its way."
```

### Hotel slot extraction (`src/travelParse.js`)

`extractHotelSlots()` parses natural language into `{ city, checkIn, checkOut, guests, nights }`. Examples:

| Input | Parsed |
|---|---|
| `"hotels in san francisco"` | `{city: "San Francisco", missing: ["check_in"]}` |
| `"hotels in vegas this weekend for 2 guests"` | `{city: "Las Vegas", checkIn: "...", checkOut: "...", guests: 2}` |
| `"book a hotel in nyc june 24 to june 26"` | `{city: "New York", checkIn: "2026-06-24", checkOut: "2026-06-26"}` |
| `"stay in chicago for 3 nights"` | `{city: "Chicago", nights: 3, missing: ["check_in"]}` |
| `"la hotels next friday"` | `{city: "Los Angeles", checkIn: "2026-06-19", checkOut: "2026-06-20"}` |
| `"check in june 24 check out june 26 in seattle"` | `{city: "Seattle", checkIn: "2026-06-24", checkOut: "2026-06-26"}` |

City alias map covers **30+ US cities**: NYC, LA, SF, Manhattan, Hollywood, Beverly Hills, Vegas, DC, Philly, etc.

### Pricing simulation

Deterministic per-hotel — same hotel always gets the same price. Computed as:

```text
base_price_by_city  ×  price_level_multiplier (Places-provided 0-4)
  ×  (1 ± per_hotel_hash_variance)
  +  rating_bump ((rating - 4.0) × 35)
```

City bases range from `$130/night` (Vegas) to `$320/night` (Manhattan). Total adds **13% tax**. Subtotal × nights.

### Multi-photo gallery

Click any hotel photo (on the card OR the booking card) → fullscreen lightbox carousel:

- Up to **10 photos per hotel** from Google Places
- CSS scroll-snap horizontal strip (one photo per viewport)
- **Swipe** left/right on touch
- **‹ / ›** arrows on desktop (hidden under 720px width)
- **← / → keyboard arrows** to navigate
- **ESC** or tap-outside to close
- Live counter shows `current / total`
- Photos load lazily after the first one (only the visible image hits Google's media SKU)

---

## 🎙️ Voice input

Built on the browser's **Web Speech API** — no backend, no transcription costs, works in Chrome / Edge / Safari (Firefox doesn't support it, so the mic button hides and Send always shows).

```
[+ Attach]                                  [🎙️ Mic]
        ↑ when input is empty                    ↑ swaps to dark Send when you type

[User taps mic]
  → Mic pulses red
  → "Listening…" pill appears above the composer with animated waveform bars
  → Composer card gets a soft red glow
  → Placeholder changes to "Listening…"
  → Live transcript fills the input as you speak
  → After 3 seconds of silence, mic stops AND the message auto-submits
  → Tap mic mid-stream to cancel without submitting
```

Tuned for accent + food/travel vocabulary:
- `lang = "en-IN"` (Indian English acoustic model — handles "samosa", "chai", "JFK")
- `maxAlternatives = 3` (more recognizer compute on disambiguation)
- `SILENCE_MS = 3000` (3-second pause auto-submit)

---

## 🔌 Plug in any model

Two provider paths, picked automatically:

```text
hasAnthropic()   → callAnthropicApi   (native Messages API)
hasOpenAi()      → callOpenAiCompatibleApi   (OpenAI / Groq / Gemini / Ollama / OpenRouter)
neither set      → deterministic local responder
```

```js
// src/aiBrain.js (excerpt)
async function callLlm(args) {
  if (hasAnthropic()) return callAnthropicApi(args);
  if (hasOpenAi()) return callOpenAiCompatibleApi(args);
  return "";
}
```

Anthropic path uses `x-api-key` + `anthropic-version: 2023-06-01`, system prompt as a top-level field, response from `content[0].text`. OpenAI-compat path uses standard chat-completions shape.

Provider errors **surface visibly** in the server log now (`[ai] OpenAI 429 — falling back to local responder...`) instead of failing silently. Important if your quota runs out — without the log you'd just see templated replies and not know why.

> 📄 See [docs/architecture-decisions.md](#-why-no-langchain--langgraph) for why we don't add LangChain on top.

---

## 🛡️ AI tool surface

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
Travel:       search_flights   (Duffel-backed)
              search_hotels    (Google Places-backed)
```

Tools the model **cannot** call (because they don't exist on the tool surface):
**sales reports · payroll · payment tokens · vendor contracts · admin · raw SQL**

If the tool doesn't exist, the AI cannot use it. ✅

---

## 📡 API surface

```text
GET  /api/health
GET  /api/restaurants
GET  /api/menu/search
GET  /api/mcp/tools               tool registry introspection

POST /api/chat                    JSON request / response
POST /api/chat/stream             SSE token stream

POST /api/orders/draft            food order: create draft
POST /api/orders/{id}/confirm     food order: confirm
POST /api/orders/{id}/cancel      food order: cancel
GET  /api/orders/{id}             food order: fetch

POST /api/booking/passengers      flight booking: update passengers
                                  body: { sessionId, passengers: [...] }
                                  returns recomputed booking with new fare + wallet
```

### Example chat request

```bash
curl -s http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"flights from lax to jfk for 2 people on 23 june"}'
```

```jsonc
{
  "sessionId": "...",
  "reply": "Here are some great options for your flight from LAX to JFK on June 23...",
  "context": {
    "intent": "flight_search_results",
    "flightSlots": { "origin": "LAX", "destination": "JFK", "departDate": "2026-06-23", "passengers": 2 },
    "flights": [
      { "airline": { "name": "Iberia", "iata_code": "IB" },
        "total_amount": "163.15", "total_currency": "USD",
        "slices": [{ "origin": "LAX", "destination": "JFK", "duration_label": "5h 52m", "stops": 0, ... }] },
      ...
    ]
  }
}
```

---

## 📱 Mobile UI

Designed mobile-first in the spirit of Claude's mobile app.

### Header
- Sidebar-toggle icon (left), centered "JhaPay AI" title, edit/pencil icon (right) for new chat
- 36×36 fully-round icon buttons; subtle gray hover tint

### Drawer
- Wordmark + sidebar-toggle close
- Icon-row navigation: `+ New chat`, `× End chat`
- Pickup location section
- Modes accordion: Discovery · Ordering · Payments · Rewards · Smart AI
- Footer guardrail note

### Composer
- Rounded card with soft border
- `+` attach on the left
- **Mic** when input empty → **Send** when input has text (one button at a time)
- Mic morphs to red pulsing pill when listening; "Listening…" pill above with waveform bars
- Disclaimer below: *"JhaPay AI can make mistakes. Verify before paying."*

### Cards
- **Flight cards**: Kayak-style — airline + flight code left, big route in middle with plane glyph, price + dark Select on right with subtle off-white aside background
- **Booking card**: Order-card-style — gold top bar, status badge, flight summary, **passenger editor** with Edit/Remove/+Add, fare breakdown, conditions line, JhaPay wallet panel, Confirm & pay button (disabled until valid)
- **Menu cards / Location cards / Order cards**: existing food patterns, untouched
- Serif typography for assistant prose, light-gray pill for user messages

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

For travel testing, the test suite is best done end-to-end via the chat API — see the [API example](#example-chat-request) above.

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

Same Postgres database, different role permissions. Flight bookings are session-scoped only — they don't persist to Postgres in the current demo.

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

## 🎁 Scope-guarded prompt

The system prompt restricts the model to JhaPay-only topics with a fixed refusal template — see [`BASE_SYSTEM_PROMPT`](src/aiBrain.js).

```text
SCOPE — you only answer questions about:
- JhaPay restaurants, locations, hours, menus, prices
- Orders (draft, modify, confirm, cancel, status, history)
- JhaPay wallet (balance, recharge, pay, split, QR, request)
- Rewards (points, coupons, cashback, milestones, discounts)
- Personalized food/spending suggestions tied to the user's own history
- Travel bookings via JhaPay — US flight search AND US hotel search,
  with options, booking draft, confirmation, cancellation

REFUSE everything else (poems, jokes, code, math, world knowledge,
role-play). Reply with exactly:
"I can only help with JhaPay restaurants, orders, wallet, rewards,
and travel bookings. What can I help you with there?"
```

For **creative formats specifically** (haiku, poem, verse, song, rap, etc.), a regex pre-filter in `wantsCreativeFormat()` short-circuits **before** the LLM call so even cheap models can't be talked into composing verse about an in-domain object.

---

## 🗂️ Project layout

```text
jhax-ai-chat-bot/
├── api/[...path].js          # Vercel serverless entry (defers to src/server)
├── public/
│   ├── index.html            # Chat UI shell + voice indicator + composer card
│   ├── styles.css            # Mobile-first Claude-style theme + flight cards + booking card
│   └── app.js                # Streaming chat + voice input + flight/booking renderers
├── src/
│   ├── server.js             # HTTP + SSE + routing + /api/booking/passengers
│   ├── aiBrain.js            # Pillars · scope guard · LLM dispatcher (Anthropic + OpenAI-compat)
│   ├── mcpEngine.js          # ~22 JSON-schema'd tools incl. search_flights, search_hotels
│   ├── duffel.js             # Duffel sandbox client (flight search)
│   ├── googlePlaces.js       # Google Places (New) client (hotel search + photo URLs + price simulation)
│   ├── travelParse.js        # Slot extraction · date parsing · city→IATA + hotel-city alias maps
│   ├── rag.js                # Pillar-scoped context retrieval
│   ├── db.js                 # Postgres / in-memory store
│   ├── demoData.js           # Seed restaurants + menu items
│   └── smoke-test.js         # End-to-end smoke suite
├── .env.example              # Provider configs + Duffel + Google Places
└── vercel.json               # Vercel routing
```

---

## 🚢 Production upgrade path

Before shipping for real, replace the demo stubs with:

- 🔐 Real auth (customer identity + session) — currently sessions are in-memory
- 🛒 Real POS provider for food (keep `create_order_draft` / `confirm_order` contracts stable)
- 💳 Real payment / wallet provider (current JhaPay wallet is a mock with $5,000 demo balance)
- ✈️ **Duffel production token** (one env var swap: `duffel_test_*` → `duffel_live_*`) + their booking agreement
- 🏨 **Hotel booking provider** — Google Places doesn't book; pair Places (discovery + photos) with a real OTA API like [Liteapi](https://liteapi.travel), [Booking.com Affiliate](https://partners.booking.com), [Hotelbeds](https://www.hotelbeds.com), or [Expedia EAN](https://developers.expediagroup.com)
- 📋 Real menu source (your CMS or POS feed)
- 🗄️ Shared session store (Redis) — for food orders, pending flight bookings, AND pending hotel bookings
- 🚦 API auth + rate limiting on `/api/booking/passengers` and `/api/chat`
- 📊 Observability (OpenTelemetry traces, error tracking on Duffel + Places failures)
- 📜 Audit dashboards (the tool audit log is already wired)
- 🚀 CI/CD pipeline

### What changes when you go to Duffel production

| Thing | Sandbox | Production |
|---|---|---|
| Token | `duffel_test_*` | `duffel_live_*` (requires verification + agreement) |
| Inventory | Synthetic + real airline mix | All real airlines |
| "Today" | Virtual clock ~6 weeks ahead | Real-time |
| Booking | Fake PNR | Real ticketed PNR + email itinerary |
| Payment | None | Real card / 3DS / wallet integration required |
| Refunds & changes | Conditions field accurate | Conditions enforce real airline rules |

---

## 📦 Demo data

Real public food locations represented: **Hesperia · Torrance · Colton**

Demo food locations (synthetic): Anaheim · Riverside · Pasadena · Long Beach · Irvine · Ontario · San Diego

Menu spans breakfast · burgers · combos · Mexican · sandwiches · sides · kids meals · drinks. Inspired by public Olympic Flame Burgers data.

For flights, Duffel sandbox returns real airlines on real US routes between any IATA pair — no seed data needed.

---

## License

MIT — see [LICENSE](LICENSE) (add one if you don't have it yet).

---

<div align="center">

**Built as a reference architecture for AI-safe conversational commerce.**

If this helped, ⭐ the repo. PRs welcome.

</div>
