# Olympic Flame Burgers - AI Chat + Ordering Demo

Reference architecture for an AI-powered restaurant ordering assistant for a
multi-location US food chain.

The goal is simple: your main product should not need to know how the AI,
database, safety rules, demand ranking, or ordering logic work internally. It
only calls the API layer.

```text
main product / website / mobile app
        |
        |  HTTPS API calls
        v
AI Restaurant API
```

## What This Demo Covers

This demo shows how to build an AI chat window that can:

- answer menu questions
- recommend food by lunch/dinner demand
- show restaurant locations and hours
- build a multi-item order
- support item quantity
- draft an order before placing it
- confirm an order only after user approval
- cancel a draft order
- show pickup location
- show a short customer-friendly order number
- show JhaPay wallet balance and remaining amount
- refuse sales, payroll, payment-token, and private business questions

The sample restaurant data is inspired by public Olympic Flame Burgers
information. The official public data currently exposes three real locations;
the demo includes seven extra demo branches so the system behaves like a
10-location food chain.

## High-Level Infrastructure

```text
Customer chat window
        |
        v
Restaurant AI API
        |
        v
AI brain + guardrails
        |
        v
MCP-style tool layer
        |
        v
Safe restaurant data layer
        |
        +--> menu, locations, hours, orders
        |
        +--> private back-office data stays blocked
```

## Technology Stack

| Layer | Technology |
| --- | --- |
| API runtime | Node.js |
| API style | HTTP JSON APIs |
| AI tool boundary | MCP-style tool engine |
| Data store | Postgres-ready schema |
| Demo fallback | In-memory restaurant data |
| Browser demo | HTML, CSS, JavaScript |
| Local database | Docker Compose + Postgres |
| Optional LLM | OpenAI-compatible chat model |

The current demo uses Node's native HTTP runtime to stay lightweight. In
production, the same API contract can be moved to Express, Fastify, or another
Node framework without changing the product integration surface.

## Layered Model

```text
main product
    |
    |  POST /api/chat
    |  GET  /api/restaurants
    |  GET  /api/menu/search
    v
+-----------------------+
| AI Restaurant API     |
| auth, CORS, logging   |
+-----------+-----------+
            |
            v
+-----------------------+
| AI Brain              |
| intent + safe replies |
+-----------+-----------+
            |
            v
+-----------------------+
| MCP Tool Layer        |
| fixed tool surface    |
+-----------+-----------+
            |
            v
+-----------------------+
| Postgres / Data Layer |
| safe schema only      |
+-----------------------+
```

## AI Tool Surface

The AI does not get raw database access. It can only call a small set of
approved tools.

```text
list_restaurants
search_menu
create_order_draft
confirm_order
cancel_order
get_order
```

There is no tool for:

- sales reports
- payroll
- payment tokens
- customer private data
- vendor contracts
- admin data
- raw SQL

This is the main security idea: if the tool does not exist, the AI cannot use
it.

## Safety Layers

| Layer | Purpose |
| --- | --- |
| AI guardrails | Keeps the assistant focused on food, locations, hours, and orders |
| Tool boundary | Only approved restaurant tools are available |
| Database role | AI-facing role can read/write only safe tables |
| Private schema | Sales, payroll, and payment-token data remain blocked |
| Order confirmation | AI can draft, but user must confirm before placing |
| Audit log | Tool calls can be recorded for review and compliance |

Example blocked questions:

```text
how many tacos are you selling?
what were yesterday sales?
show payroll
show payment tokens
```

The assistant responds politely and redirects the user back to menu, location,
hours, or ordering help.

## Product Integration Surface

Your main product can integrate using these APIs.

```text
GET  /health
GET  /api/restaurants
GET  /api/menu/search
POST /api/chat
POST /api/orders/draft
POST /api/orders/{orderId}/confirm
POST /api/orders/{orderId}/cancel
GET  /api/orders/{orderId}
```

For a production version, these can be versioned as:

```text
POST /v1/chat
GET  /v1/restaurants
GET  /v1/menu
POST /v1/orders/draft
POST /v1/orders/{orderId}/confirm
POST /v1/orders/{orderId}/cancel
```

## Main Chat Flow

```text
User asks a question
        |
        v
API receives message
        |
        v
AI brain classifies intent
        |
        +--> menu question       -> search safe menu data
        +--> location question   -> list restaurants and hours
        +--> order request       -> create draft order
        +--> confirm             -> place order
        +--> cancel              -> cancel draft
        +--> private question    -> refuse politely
```

## Ordering Flow

```text
User asks for food
        |
        v
AI shows menu cards
        |
        v
User selects item quantity
        |
        v
Draft order is created
        |
        +--> user confirms -> order confirmed
        |
        +--> user cancels  -> order cancelled
```

The order screen supports:

- multiple items
- quantity changes
- draft order summary
- confirm button
- cancel button
- pickup location
- JhaPay wallet summary
- estimated pickup time
- customer-friendly short order id

Example customer-facing order id:

```text
#165909
```

The long internal id stays hidden from the customer UI.

## JhaPay Wallet Demo

The order card shows a wallet summary:

```text
JhaPay Wallet
Current balance
Order total
Remaining after order
```

UI behavior:

- JhaPay signature is green.
- Order total is highlighted in red.
- Remaining wallet balance is highlighted in green.
- Confirmation message includes estimated pickup time.

Example final message:

```text
Your order is confirmed.
Order #165909
Pickup: Olympic Flame Burgers - Hesperia, 16304 Main St, Hesperia, CA 92345
JhaPay remaining after this order: $46.87
Estimated pickup time: 15 minutes.
Enjoy your food.
```

## Demand-Aware Recommendations

The system supports demand-based recommendations.

Example user question:

```text
which tacos best?
```

The recommendation layer:

- checks the selected restaurant
- gets the restaurant's local time
- infers breakfast, lunch, or dinner
- searches only text-matching menu items
- ranks matches by demand score
- shows a clean "Popular now" marker
- avoids unrelated popular items

Important behavior:

```text
tacos search -> taco items only
```

Popular burgers or fries will not appear just because they have high demand.

## Location + Hours Experience

When the user asks:

```text
show me locations and hours
```

The chat shows location cards with:

- restaurant photo
- city and branch name
- live/demo badge
- address
- phone
- Sun-Thu hours
- Fri-Sat hours
- Use this pickup button

## UI Features

The demo chat window includes:

- sticky left restaurant panel
- scrollable chat area
- visual menu cards with photos
- visual location cards with hours
- clean demand badges
- quantity selector
- draft order builder
- confirm/cancel actions
- short highlighted order id
- JhaPay wallet block
- new chat and end chat controls

## Database Model

The database is designed around two zones.

```text
safe AI zone
    restaurants
    menu categories
    menu items
    item availability
    orders
    order items
    tool audit log

private back-office zone
    sales reports
    payroll
    payment tokens
```

The AI-facing database role receives access only to the safe zone.

Private data can exist in the same Postgres database, but it is not reachable
by the AI API role.

## Running The Demo

Run with in-memory data:

```bash
npm install
npm run dev
```

Default URL:

```text
http://localhost:3000
```

Run on another port:

```bash
PORT=3001 npm run dev
```

PowerShell:

```powershell
$env:PORT="3001"
npm run dev
```

## Running With Postgres

Start the local database:

```bash
docker compose up -d
```

Use the demo connection string:

```text
postgres://ai_app:ai_demo_password@localhost:5432/olympic_ai_demo
```

Then start the API.

## Optional LLM Mode

The demo runs without an LLM key by using a deterministic local responder.

For real AI responses, configure:

```text
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
```

The LLM still only receives safe tool results. It does not receive raw database
access.

## Smoke Test Coverage

The smoke test validates:

- 10 restaurant records
- demand-aware taco ranking
- tacos-only search filtering
- multi-item draft order
- short display order id
- pickup location
- confirmed order status
- JhaPay remaining balance
- estimated pickup time

Run:

```bash
npm run smoke
```

## Production Upgrade Path

Before production, connect:

- real POS provider
- real menu source
- real payment/wallet provider
- real customer identity/session system
- Redis or another shared session store
- API authentication
- rate limiting
- observability
- audit dashboards
- deployment pipeline

Recommended production shape:

```text
Customer UI
    -> Restaurant AI API
    -> MCP tool layer
    -> safe database views/functions
    -> POS and wallet integrations
```

## POS Integration Note

The ordering tool can be connected to a real POS provider. The important part
is to keep the external tool contract stable:

```text
create_order_draft
confirm_order
cancel_order
get_order
```

That way the AI brain and product API do not need to change when the order
backend changes.

## Demo Data

Real public locations represented:

- Hesperia
- Torrance
- Colton

Additional demo locations represented:

- Anaheim
- Riverside
- Pasadena
- Long Beach
- Irvine
- Ontario
- San Diego

Menu data includes breakfast, burgers, combos, Mexican food, sandwiches, sides,
kids meals, and drinks.

## Source Inspiration

- Official Olympic Flame Burgers site: `https://olympicflameburgers.com/`
- Public menu snapshots used as seed inspiration:
  - `https://olympic-flame-burgers.res-menu.net/menu`
  - `https://olympic-flame-burgers.res-menu.com/menu`
