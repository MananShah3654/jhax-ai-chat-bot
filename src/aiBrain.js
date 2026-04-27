// ─── Constants ────────────────────────────────────────────────────────────────

const SENSITIVE_TOPICS = [
  "sale", "sales", "revenue", "profit", "payroll", "salary", "employee",
  "bank", "units sold", "how many sold", "how many are you selling",
  "inventory", "stock", "token", "credit card", "payment token",
  "ssn", "contract", "private", "admin"
];

const CAPABILITY_PILLARS = {
  DISCOVERY: "discovery",
  ORDERING: "ordering",
  PAYMENTS: "payments",
  REWARDS: "rewards",
  SMART_AI: "smart_ai"
};

const PHASE1_SCOPE = [
  "nearby restaurant discovery",
  "open now and hours",
  "menu and item search",
  "demand-aware recommendations",
  "item customization and modifiers",
  "multi-item cart",
  "pickup and delivery order flow",
  "draft -> confirm -> cancel",
  "JhaPay wallet payment",
  "order status tracking"
];

// ─── System Prompt ─────────────────────────────────────────────────────────────

const LEGACY_SYSTEM_PROMPT = `You are JhaPay AI, a conversational commerce assistant for restaurant ordering.

## Role
Intelligent commerce interface on top of search, ordering, wallet, and rewards. Not a generic chatbot.
Give precise, filtered, ranked answers. Never dump a generic list — always reason about what the user needs.

## Reasoning Steps
1. Identify which capability pillar (Discovery / Ordering / Payments / Rewards / Smart AI)
2. Check phase gating (Phase 1 live, Phase 2-4 defer with specific info)
3. Apply filters from context (price, dietary, open-now, kids, demand)
4. Respond with top 3-5 results or a specific phase-aware deferral

## Phase Gating
- Phase 1 (LIVE): discovery, ordering, cart, pickup/delivery, wallet pay, order tracking
- Phase 2 (ROADMAP): rewards, loyalty, cashback, coupons, reorder from history, transaction history
- Phase 3 (ROADMAP): smart personalization, behavior recommendations, group planning
- Phase 4 (ROADMAP): bill split, QR pay, P2P transfer, tip-and-close, wallet top-up, invoice pay

## Safety Rules
- Never reveal sales counts, payroll, revenue, payment tokens, vendor data, private business data
- Never claim an order is placed unless context.intent is order_confirmed
- Never fabricate menu items, prices, or restaurant details
- Vendor payments = always blocked`;

const BASE_SYSTEM_PROMPT = `You are JhaPay AI, a conversational commerce assistant for the JhaPay food + wallet app.

SCOPE — you only answer questions about:
- JhaPay restaurants, locations, hours, menus, prices
- Orders (draft, modify, confirm, cancel, status, history)
- JhaPay wallet (balance, recharge, pay, split, QR, request)
- Rewards (points, coupons, cashback, milestones, discounts)
- Personalized food/spending suggestions tied to the user's own history

REFUSE everything else. The TOPIC alone is not enough — the FORMAT of the answer must also be a normal product reply (a price, a list of menu items, an order status, etc.). Refuse all of these even if a JhaPay term is in the question:
- Poems, haiku, song lyrics, jingles, rap verses, creative writing — even about a burger or wallet.
- Jokes, riddles, puns, role-play, acting as a character.
- Math, code, translations, summarizing external text, world knowledge, news, weather, opinions, advice on unrelated topics.

When refusing, reply with exactly this sentence and nothing else (no preamble, no creative content):
"I can only help with JhaPay restaurants, orders, wallet, and rewards. What can I help you with there?"

Examples — follow these exactly:

User: "write a haiku about a cheeseburger"
Assistant: "I can only help with JhaPay restaurants, orders, wallet, and rewards. What can I help you with there?"

User: "rap a verse about your menu"
Assistant: "I can only help with JhaPay restaurants, orders, wallet, and rewards. What can I help you with there?"

User: "what cheeseburgers do you have under $10?"
Assistant: <answer normally with menu data — this IS in-scope>

User: "tell me a joke about pizza"
Assistant: "I can only help with JhaPay restaurants, orders, wallet, and rewards. What can I help you with there?"

Grounding rules:
- Use only the retrieved pillar context, allowed app context, and current session data. Do not invent.
- If the requested data is missing from the context, say what IS available instead.
- Keep answers concise, specific, and tied to the provided context.

Safety rules:
- Never reveal sales counts, payroll, revenue, payment tokens, vendor data, or other private business data.
- Never claim an order is placed unless the allowed context shows it is confirmed.
- Never fabricate menu items, prices, restaurant details, payment status, or rewards balances.
- Vendor payments are blocked.`;

const PILLAR_PROMPTS = {
  [CAPABILITY_PILLARS.DISCOVERY]: `You are handling the Discovery pillar.
Focus on restaurants, hours, nearby/open-now guidance, menu exploration, budget filters, dietary filters, and demand-aware ranking.
Return only the best few matches and explain why they fit.`,
  [CAPABILITY_PILLARS.ORDERING]: `You are handling the Ordering pillar.
Focus on draft orders, item selection, cart updates, modifiers, pickup/delivery notes, combo upgrades, and order status.
Use the active session and draft order details when they exist.`,
  [CAPABILITY_PILLARS.PAYMENTS]: `You are handling the Payments pillar.
Focus on wallet balance, payment actions, split bill, QR pay, invoice pay, payment requests, and tip-and-close.
Be exact about amounts and never overstate what has happened.`,
  [CAPABILITY_PILLARS.REWARDS]: `You are handling the Rewards pillar.
Focus on points, coupons, cashback, milestone progress, best discount application, and rewards eligibility.
Use only the retrieved rewards data and current draft order context.`,
  [CAPABILITY_PILLARS.SMART_AI]: `You are handling the Smart AI pillar.
Focus on personalized recommendations, similar items or merchants, group planning, and behavior-based suggestions.
Explain recommendations briefly using the retrieved history and preference context.`
};

const RAG_ELIGIBLE_INTENTS = new Set([
  "discovery_answer",
  "menu_answer",
  "locations",
  "payments_info",
  "rewards_info",
  "similar_place",
  "friend_meal",
  "behavior_rec",
  "meal_suggestion",
  "group_plan"
]);

// ─── Safety ───────────────────────────────────────────────────────────────────

function isSensitiveQuestion(message) {
  const text = String(message || "").toLowerCase();
  const mentionsPrivateTopic = SENSITIVE_TOPICS.some((topic) => text.includes(topic));
  const asksBusinessCount = /\b(how many|count|number of|total)\b.*\b(sell|selling|sold|orders?|ordered|stock|inventory)\b/.test(text);
  return mentionsPrivateTopic || asksBusinessCount;
}

// ─── Pillar Detectors ─────────────────────────────────────────────────────────

function wantsDiscovery(message) {
  const text = String(message || "").toLowerCase();
  return /\b(near(by)?|open now|open today|right now|closest|within \d+\s*miles?|distance|miles?|km|cuisine|vegan|halal|gluten.free|trending|top.rated|best rated|hours|closing time|open late|late.night|outdoor|patio|family.friendly|kids.friendly|coffee\s*shops?|cafe|healthy|cheap eats|budget|affordable|under \$|less than \$)\b/.test(text);
}

function wantsOrder(message) {
  const text = String(message || "").toLowerCase();
  return /\b(order|buy|get me|i want|place|pickup|reorder|usual|last order)\b/.test(text);
}

function wantsAddToOrder(message) {
  const text = String(message || "").toLowerCase();
  return /^\s*(add|also add|throw in|include|and also)\b/.test(text);
}

function wantsModifyOrder(message) {
  const text = String(message || "").toLowerCase();
  return /\b(remove|no |without |extra |add extra|hold the|substitute|swap|change)\b/.test(text) &&
    /\b(onion|cheese|pickle|sauce|tomato|lettuce|mayo|mustard|ketchup|jalapeno|bacon|avocado)\b/.test(text);
}

function wantsComboUpgrade(message) {
  const text = String(message || "").toLowerCase();
  return /\b(make it a combo|upgrade to combo|combo instead|as a combo|combo version)\b/.test(text);
}

function wantsPickupTime(message) {
  const text = String(message || "").toLowerCase();
  return /\b(pickup in|ready in|pick up in|order.*pickup|pickup.*\d+\s*min)\b/.test(text);
}

function wantsDelivery(message) {
  const text = String(message || "").toLowerCase();
  return /\b(deliver(y|ed)?|delivery to|bring it to|send it to|order.*delivery|home delivery)\b/.test(text);
}

function wantsReorderHistory(message) {
  const text = String(message || "").toLowerCase();
  return /\b(reorder|order my usual|same as last time|last friday|last week.*order|usual order|my usual|order again)\b/.test(text);
}

function wantsTableService(message) {
  const text = String(message || "").toLowerCase();
  return /\b(table\s*\d+|order for table|table order|dine.?in|sit.?down)\b/.test(text);
}

function wantsScheduledOrder(message) {
  const text = String(message || "").toLowerCase();
  return /\b(schedule.*order|order.*at\s+\d|order for\s+\d+[ap]m|ready.*at\s+\d|deliver.*at\s+\d)\b/.test(text);
}

function wantsOrderTracking(message) {
  const text = String(message || "").toLowerCase();
  return /\b(track.*order|order status|where.*my order|order.*ready|how long.*order|order.*progress)\b/.test(text);
}

function wantsPayment(message) {
  const text = String(message || "").toLowerCase();
  return /\b(pay\b|wallet|pay.*bill|pay.*order|checkout|charge|transaction)\b/.test(text);
}

function wantsBillSplit(message) {
  const text = String(message || "").toLowerCase();
  return /\b(split.*\$|split.*between|split the bill|divide.*bill|share.*bill)\b/.test(text);
}

function wantsP2PTransfer(message) {
  const text = String(message || "").toLowerCase();
  return /\b(send \$|send money|transfer \$|transfer to|pay \$.*to [a-z]|venmo)\b/.test(text);
}

function wantsTipClose(message) {
  const text = String(message || "").toLowerCase();
  return /\b(tip.*close|add.*tip|close.*check|close the check|tip.*and.*pay|tip percent)\b/.test(text);
}

function wantsWalletRecharge(message) {
  const text = String(message || "").toLowerCase();
  return /\b(recharge wallet|top.?up wallet|add.*to wallet|load wallet|wallet.*\$\d+|fund.*wallet)\b/.test(text);
}

function wantsQRPay(message) {
  const text = String(message || "").toLowerCase();
  return /\b(pay.*qr|scan.*qr|qr.*pay|qr code|qr.*payment)\b/.test(text);
}

function wantsInvoicePay(message) {
  const text = String(message || "").toLowerCase();
  return /\b(pay.*invoice|invoice.*pay|settle.*invoice)\b/.test(text);
}

function wantsRequestPayment(message) {
  const text = String(message || "").toLowerCase();
  return /\b(request.*payment|ask.*for.*payment|collect.*from|request.*money|send.*request)\b/.test(text);
}

function wantsVendorPay(message) {
  const text = String(message || "").toLowerCase();
  return /\b(pay vendor|vendor.*payment|pay.*supplier|vendor.*pay)\b/.test(text);
}

function wantsAutoPay(message) {
  const text = String(message || "").toLowerCase();
  return /\b(auto.?pay|recurring.*pay|pay.*every week|scheduled.*pay|automatic.*pay|repeat.*pay)\b/.test(text);
}

function wantsRewards(message) {
  const text = String(message || "").toLowerCase();
  return /\b(reward|point|cashback|coupon|discount|offer|deal|promo|free item|loyalty|milestone)\b/.test(text);
}

function wantsPointsBalance(message) {
  const text = String(message || "").toLowerCase();
  return /\b(how many points|my points|points balance|reward points|check.*points|points.*have)\b/.test(text);
}

function wantsRedeemPoints(message) {
  const text = String(message || "").toLowerCase();
  return /\b(redeem.*points|where.*redeem|use.*points|spend.*points|points.*redeem)\b/.test(text);
}

function wantsDealsNearby(message) {
  const text = String(message || "").toLowerCase();
  return /\b(deals near|deals.*right now|any deals|offers near|promotions near|specials near)\b/.test(text);
}

function wantsBestDiscount(message) {
  const text = String(message || "").toLowerCase();
  return /\b(apply.*discount|best discount|best coupon|apply.*coupon|best.*deal.*order|auto.*discount)\b/.test(text);
}

function wantsFreeItems(message) {
  const text = String(message || "").toLowerCase();
  return /\b(get for free|what.*free|free item|free.*today|claim.*free|free.*reward)\b/.test(text);
}

function wantsCashbackOffers(message) {
  const text = String(message || "").toLowerCase();
  return /\b(cashback offers|show.*cashback|cashback.*near|earn.*cashback)\b/.test(text);
}

function wantsApplyRewards(message) {
  const text = String(message || "").toLowerCase();
  return /\b(use.*rewards|apply.*rewards|rewards.*order|redeem.*rewards|use my rewards)\b/.test(text);
}

function wantsDealAlerts(message) {
  const text = String(message || "").toLowerCase();
  return /\b(notify.*when|alert.*when|deal.*alert|price.*alert|deal.*drop|notify.*deals)\b/.test(text);
}

function wantsMilestoneCheck(message) {
  const text = String(message || "").toLowerCase();
  return /\b(milestone|reward.*tier|close.*reward|how close|near.*milestone|points.*away)\b/.test(text);
}

function wantsStackCoupons(message) {
  const text = String(message || "").toLowerCase();
  return /\b(stack.*coupon|combine.*coupon|multiple.*coupon|coupon.*stack)\b/.test(text);
}

function wantsTransactionHistory(message) {
  const text = String(message || "").toLowerCase();
  return /\b(last \d+ transactions|transaction history|show.*transactions|my transactions|recent.*transactions)\b/.test(text);
}

function wantsSpendInsights(message) {
  const text = String(message || "").toLowerCase();
  return /\b(what.*spent|how much.*spent|spending this|spend.*week|spend.*month|my spending)\b/.test(text);
}

function wantsOrderHistory(message) {
  const text = String(message || "").toLowerCase();
  return /\b(show.*orders|order history|orders at|my orders|past orders|previous orders)\b/.test(text);
}

function wantsReceiptDownload(message) {
  const text = String(message || "").toLowerCase();
  return /\b(download.*receipt|my receipts|get.*receipt|email.*receipt|receipt.*download)\b/.test(text);
}

function wantsMealSuggestion(message) {
  const text = String(message || "").toLowerCase();
  return /\b(suggest.*like|similar.*ate|like.*last time|like.*usual|based on.*ate|what.*like)\b/.test(text);
}

function wantsSimilarPlace(message) {
  const text = String(message || "").toLowerCase();
  return /\b(similar to|places like|find.*like|like knowlwood|restaurant.*like|spot.*like)\b/.test(text);
}

function wantsFriendMeal(message) {
  const text = String(message || "").toLowerCase();
  return /\b(same as\s+\w+|.*'s favorite|\w+'s usual|order.*like\s+\w+|what.*\w+\s+orders|friend.*meal|order.*same as)\b/.test(text);
}

function wantsBehaviorRec(message) {
  const text = String(message || "").toLowerCase();
  return /\b(based on.*past|what should i eat|recommend.*based|suggest.*history|past orders.*suggest)\b/.test(text);
}

function wantsGroupPlan(message) {
  const text = String(message || "").toLowerCase();
  return /\b(plan.*dinner.*for|dinner.*for \d+|group.*order.*for|order.*for \d+ people|feed \d+ people)\b/.test(text);
}

function wantsRecommendation(message) {
  const text = String(message || "").toLowerCase();
  return /\b(best|popular|highly ordered|most ordered|demand|recommended|recommend|favorite|favourite|suggest)\b/.test(text);
}

// ─── Discovery / Extraction Helpers ──────────────────────────────────────────

function extractPriceCeiling(message) {
  const text = String(message || "").toLowerCase();
  const withDollar = text.match(/(?:under|less than|below|max|no more than|within)\s*\$\s*(\d+(?:\.\d+)?)/);
  if (withDollar) return parseFloat(withDollar[1]);
  const dollarWord = text.match(/(?:under|less than|below|max)\s*(\d+(?:\.\d+)?)\s*dollars?/);
  if (dollarWord) return parseFloat(dollarWord[1]);
  const orLess = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:or less|or under|max)/);
  if (orLess) return parseFloat(orLess[1]);
  return 0;
}

function extractGroupSize(message) {
  const text = String(message || "");
  // "for 4 people", "for 4 under $60", "dinner for 4", "4 people"
  const withWord = text.match(/(\d+)\s+(?:people|person|guests?|of us|friends?)/i);
  if (withWord) return parseInt(withWord[1]);
  const afterFor = text.match(/for\s+(\d+)\b/i);
  if (afterFor) return parseInt(afterFor[1]);
  return 0;
}

function extractBillAmount(message) {
  const text = String(message || "");
  const match = text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractDietaryFilters(message) {
  const text = String(message || "").toLowerCase();
  const filters = [];
  if (/\bvegan\b/.test(text)) filters.push("vegan");
  if (/\bvegetarian\b/.test(text)) filters.push("vegetarian");
  if (/\bgluten.free\b/.test(text)) filters.push("gluten-free");
  if (/\bhalal\b/.test(text)) filters.push("halal");
  if (/\bhealthy|light meal|low.cal\b/.test(text)) filters.push("healthy");
  return filters;
}

function extractItemsToAdd(message) {
  const text = String(message || "").toLowerCase();
  const addMatch = text.match(/(?:add|also add|throw in|include)\s+(.+?)(?:\s+to\s+(?:my\s+)?(?:order|cart))?$/i);
  if (!addMatch) return [];
  return addMatch[1]
    .split(/\s*(?:\+|and|,)\s*/i)
    .map((s) => normalizeItemQuery(s.trim()))
    .filter(Boolean);
}

function normalizeItemQuery(q) {
  const text = q.toLowerCase().trim();
  if (/\b(coke|pepsi|cola|diet coke|root beer|sprite|7up|lemonade|dr pepper|fountain drink)\b/.test(text)) return "soda";
  if (/\b(french fries?|fry)\b/.test(text)) return "fries";
  if (/\b(onion rings?)\b/.test(text)) return "onion rings";
  if (/\b(chicken nuggets?)\b/.test(text)) return "kids nuggets";
  return text;
}

function extractModifierNote(message) {
  const text = String(message || "").toLowerCase().trim();
  const clean = text
    .replace(/\bplease\b/gi, "")
    .replace(/\bcan you\b/gi, "")
    .replace(/\bi (want|need|would like)\b/gi, "")
    .trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function isOpenNowQuery(message) {
  return /\b(open now|open right now|open today|right now|currently open|still open)\b/i.test(message);
}

function isLateNightQuery(message) {
  return /\b(late.night|after 1[01]pm|after 10|after 11|midnight|11pm|10pm.*open|open.*11pm)\b/i.test(message);
}

function isKidsFriendlyQuery(message) {
  return /\b(kids?|children|family.friendly|family friendly|for kids|kid.friendly)\b/i.test(message);
}

function isTrendingQuery(message) {
  return /\b(trending|top.rated|best rated|most popular|highest rated|top picks|most ordered)\b/i.test(message);
}

function isOutdoorQuery(message) {
  return /\b(outdoor|patio|outside seating|terrace|alfresco)\b/i.test(message);
}

function isCoffeeShopQuery(message) {
  return /\b(coffee\s*shops?|cafe|café|cappuccino|latte|espresso)\b/i.test(message);
}

function reasonPillar(message) {
  if (isSensitiveQuestion(message)) return "blocked";
  if (wantsPayment(message)) return CAPABILITY_PILLARS.PAYMENTS;
  if (wantsRewards(message)) return CAPABILITY_PILLARS.REWARDS;
  if (wantsGroupPlan(message) || wantsMealSuggestion(message) || wantsBehaviorRec(message) || wantsSimilarPlace(message)) return CAPABILITY_PILLARS.SMART_AI;
  if (wantsDiscovery(message)) return CAPABILITY_PILLARS.DISCOVERY;
  if (wantsOrder(message)) return CAPABILITY_PILLARS.ORDERING;
  return CAPABILITY_PILLARS.ORDERING;
}

function detectDayPart(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("breakfast") || text.includes("morning")) return "breakfast";
  if (text.includes("lunch") || text.includes("noon")) return "lunch";
  if (text.includes("dinner") || text.includes("evening") || text.includes("night")) return "dinner";
  return "";
}

function extractSelectionNumber(message) {
  const text = String(message || "").toLowerCase().trim();
  const match = text.match(/^(?:order|select|choose|pick|add|get)?\s*#?\s*(\d{1,2})\b/);
  if (!match) return 0;
  return Number(match[1]);
}

function confirmsOrder(message) {
  return /\b(confirm|yes|yeah|yep|place it|go ahead|sounds good)\b/i.test(message);
}

function cancelsOrder(message) {
  return /\b(cancel|never mind|nevermind|remove|stop|no thanks|don't order|do not order)\b/i.test(message);
}

function extractMenuQuery(message) {
  return String(message || "")
    .replace(/\b(can|you|please|i|want|would|like|to|order|buy|get|me|add|for|a|an|the|what|whats|what's|which|there|in|on|menu|today|have|do|best|popular|highly|ordered|most|demand|recommended|recommend|favorite|favourite)\b/gi, " ")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Response Builders ────────────────────────────────────────────────────────

function buildItemList(items) {
  return items
    .map((item, i) => {
      const badge = item.is_highly_demanded ? "  [Most ordered]" : "";
      return `${i + 1}. ${item.name} — $${Number(item.price).toFixed(2)}${badge}\n   ${item.description}`;
    })
    .join("\n\n");
}

function buildDiscoveryHeader({ priceCeiling, dietaryFilters = [], kidsFriendly, isTrending, openNow }) {
  const parts = [];
  if (priceCeiling > 0) parts.push(`under $${priceCeiling}`);
  if (dietaryFilters.includes("vegan")) parts.push("vegan");
  else if (dietaryFilters.includes("vegetarian")) parts.push("vegetarian");
  if (dietaryFilters.includes("gluten-free")) parts.push("gluten-free");
  if (dietaryFilters.includes("healthy")) parts.push("healthier picks");
  if (kidsFriendly) parts.push("kids-friendly");
  if (isTrending) parts.push("ranked by demand");
  if (openNow) parts.push("open now");
  return parts.length > 0
    ? `Here are the best matches (${parts.join(", ")}):`
    : "Here are the top picks, ranked by popularity:";
}

function buildDiscoveryReply({ menuItems = [], restaurants = [], discoveryMeta = {} }) {
  const { priceCeiling, dietaryFilters = [], lateNight, openNow, kidsFriendly, outdoorSeating, halalOnly, coffeeShop, wantsRestaurantList, isTrending } = discoveryMeta;

  if (lateNight) {
    return "All Olympic Flame Burgers locations close at 9pm (Sun-Thu) or 10pm (Fri-Sat) — nothing is open after 11pm.\n\nWant to plan an order for tomorrow morning? We open at 6am with a full breakfast menu.";
  }
  if (outdoorSeating) {
    return "Outdoor seating details aren't tracked in our current system. Call your nearest location to confirm:\n- Hesperia: (760) 244-1992\n- Torrance: (310) 532-0195\n- Colton: (909) 572-6221\n\nCan I help you find something on the menu instead?";
  }
  if (coffeeShop) {
    return "Olympic Flame Burgers isn't a coffee shop, but we open at 6am daily with a full hot breakfast.\n\nTop breakfast picks:\n1. Breakfast Burrito with Meat — $12.49\n   Eggs, bacon, sausage, hash browns, and cheese.\n2. Two Hot Cakes and 2 Eggs — $9.99\n   Pancakes, two eggs, choice of bacon or sausage.\n3. Steak and Eggs — $17.49\n   Steak with hash browns and toast.\n\nSay \"order 1\" to draft any of these.";
  }
  if (halalOnly && dietaryFilters.length === 1) {
    return "Halal certification isn't tracked in our current menu data. Please call your nearest location directly:\n- Hesperia: (760) 244-1992\n- Torrance: (310) 532-0195\n- Colton: (909) 572-6221\n\nFor vegetarian or gluten-free options I can show those right now — just ask.";
  }
  if (wantsRestaurantList && restaurants && restaurants.length > 0) {
    const hours = "Open daily: Sun-Thu 6am-9pm, Fri-Sat 6am-10pm";
    const liveLocations = restaurants.filter((r) => !r.is_demo);
    const showList = (liveLocations.length > 0 ? liveLocations : restaurants).slice(0, 5);
    const list = showList.map((r, i) => `${i + 1}. ${r.name}\n   ${r.address}, ${r.city}, ${r.state} — ${r.phone || "call ahead"}`);
    const note = openNow ? `\nAll locations are currently open (${hours}).` : `\n${hours}`;
    return `Here are the Olympic Flame Burgers locations near you:\n\n${list.join("\n\n")}${note}\n\nWant to see the menu or place an order?`;
  }
  if (menuItems.length === 0) {
    const filterDesc = priceCeiling > 0 ? `under $${priceCeiling}` : dietaryFilters.length > 0 ? `matching ${dietaryFilters.join("/")}` : "";
    return `No items found${filterDesc ? ` ${filterDesc}` : ""}. Try asking about burgers, tacos, or breakfast.`;
  }
  const header = buildDiscoveryHeader({ priceCeiling, dietaryFilters, kidsFriendly, isTrending, openNow });
  return `${header}\n\n${buildItemList(menuItems)}\n\nSay "order 1", "order 2", etc. to place any of these.`;
}

// ─── Scenario Response Builders ───────────────────────────────────────────────

const RESPONSES = {

  // Ordering scenarios
  add_to_order_no_draft() {
    return "You don't have an active draft order yet. Tell me what you'd like to order and I'll start one — then say \"add fries\" or \"add a soda\" to include more items.";
  },

  order_updated({ order, addedNames = [] }) {
    const added = addedNames.length > 0 ? `Added ${addedNames.join(" + ")} to your order.` : "Items added to your order.";
    return `${added}\n\n${formatOrder(order, "Updated draft:")}.\n\nSay "confirm" to place it.`;
  },

  order_modified({ order, modifier }) {
    return `Got it — noted "${modifier}" on your order. The kitchen will see this.\n\n${formatOrder(order, "Updated draft:")}\n\nSay "confirm" to place it.`;
  },

  combo_upgraded({ order }) {
    return `Upgraded to combo.\n\n${formatOrder(order, "Updated draft:")}\n\nIncludes fries and a soda. Say "confirm" to place it.`;
  },

  combo_not_found({ currentItemName }) {
    return `I couldn't find a combo version of "${currentItemName}" in the menu right now.\n\nYou can add fries and a soda separately — say "add fries and soda" and I'll update your draft.`;
  },

  pickup_time_set({ minutes, order }) {
    const pickupNote = `Pickup in ${minutes} minutes noted.`;
    if (order) return `${pickupNote}\n\n${formatOrder(order, "Draft order:")}\n\nSay "confirm" to place it.`;
    return `${pickupNote} What would you like to order? I'll get your draft ready right away.`;
  },

  delivery_noted({ order }) {
    if (order) return `Delivery noted on your order.\n\n${formatOrder(order, "Draft order:")}\n\nNote: delivery address will be confirmed at the counter for this demo. Say "confirm" to place it.`;
    return "Delivery noted. What would you like delivered? Tell me your order and I'll draft it for you.\n\nNote: real address lookup and routing is in Phase 1 — for now the nearest location handles delivery.";
  },

  reorder_unavailable({ message }) {
    const isUsual = /usual|same as last/i.test(message);
    if (isUsual) {
      return "Your order history isn't connected yet — saving your \"usual\" is a Phase 1B feature.\n\nWhat would you like today? Here are the top picks right now:\n1. Lunch Street Tacos — $7.49  [Most ordered]\n2. Bacon Avocado Burger Combo — $14.99\n3. Cheeseburger Combo — $12.86\n\nSay \"order 1\" to draft any of these.";
    }
    return "Your order history isn't connected yet — reordering from past sessions is Phase 1B.\n\nI can show you today's most popular items instead. Want that?";
  },

  reorder_ready({ order, source }) {
    const label = source === "usual" ? "your usual order" : "your most recent order";
    return `I drafted ${label}.\n\n${formatOrder(order, "Reorder draft:")}\n\nSay "confirm" to place it.`;
  },

  table_service_deferred() {
    return "Table service ordering isn't available through chat yet — that's on the Phase 2 roadmap.\n\nFor now I can help you with:\n- Pickup (ready in ~15 minutes)\n- Delivery to your address\n\nWant to place a pickup order instead?";
  },

  scheduled_deferred({ scheduledTime }) {
    return `Scheduled ordering for ${scheduledTime || "a specific time"} is in the Phase 1B roadmap.\n\nHere's what I can do right now: draft your order and you confirm whenever you're ready — the kitchen starts as soon as you confirm.\n\nWant me to draft the order now?`;
  },

  order_status_active({ order }) {
    if (!order) return "No active order found in this session. Once you confirm an order, I'll track its status here.";
    const status = order.status === "confirmed"
      ? `Your order #${order.display_order_id} is confirmed and being prepared.\nEstimated pickup: ~${order.estimated_pickup_minutes || 18} minutes.\nPickup: ${order.pickup_location}`
      : `Your order #${order.display_order_id} is currently ${order.status}.`;
    return status;
  },

  // Payment scenarios
  bill_split_deferred({ split, amount, people }) {
    if (split) {
      const remainder = split.remainder ? `\nRemainder after even split: $${Number(split.remainder).toFixed(2)}.` : "";
      return `Split ready.\n\nTotal: $${Number(split.amount).toFixed(2)}\nPeople: ${split.people}\nPer person: $${Number(split.per_person).toFixed(2)}${remainder}\nWallet balance: $${Number(split.wallet_balance).toFixed(2)}\n\nIf you want, I can also send payment requests for everyone else.`;
    }
    const perPerson = amount > 0 && people > 0 ? `\nThat's $${(amount / people).toFixed(2)} per person.` : "";
    return `Bill splitting is Phase 4 of JhaPay AI.${perPerson}\n\nFor now, one person pays and I can send a payment request to others once P2P is live.\n\nWant to place an order first?`;
  },

  p2p_deferred({ amount, recipient }) {
    const detail = amount > 0 ? ` of $${amount.toFixed(2)}` : "";
    const to = recipient ? ` to ${recipient}` : "";
    return `Peer-to-peer transfers${detail}${to} are Phase 4 — we're building the identity verification and compliance layer carefully before enabling money movement.\n\nRight now, JhaPay wallet is live for restaurant orders. Want to place an order instead?`;
  },

  tip_close_deferred({ payment }) {
    if (payment) {
      return `Check closed.\n\nBase amount: $${Number(payment.base_amount).toFixed(2)}\nTip: ${payment.tip_percent}% ($${Number(payment.tip_amount).toFixed(2)})\nTotal charged: $${Number(payment.total).toFixed(2)}\nRemaining wallet balance: $${Number(payment.wallet_balance).toFixed(2)}`;
    }
    return "Tip-and-close is Phase 4.\n\nWhen it launches, you'll say \"tip 20% and close\" right here and I'll calculate, charge, and close your check automatically.\n\nFor now, tipping is handled at the counter after pickup. Is there anything else I can help with?";
  },

  wallet_recharge_deferred({ recharge }) {
    if (recharge) {
      return `Wallet recharged successfully.\n\nAdded: $${Number(recharge.amount).toFixed(2)}\nNew balance: $${Number(recharge.wallet_balance).toFixed(2)}`;
    }
    return "Wallet top-up is Phase 4.\n\nYour current demo balance is $50.00. Real wallet recharge will connect to your bank account or card once the full payments layer is live.\n\nFor now, want to use your current balance on an order?";
  },

  qr_pay_deferred({ payment }) {
    if (payment) {
      return `QR payment completed.\n\nMerchant: ${payment.merchant}\nCharged: $${Number(payment.amount).toFixed(2)}\nRemaining wallet balance: $${Number(payment.wallet_balance).toFixed(2)}`;
    }
    return "QR code payments are Phase 4.\n\nWhen that ships, you'll scan any merchant QR from this chat and I'll process the payment through JhaPay instantly.\n\nRight now I can pay your restaurant order from your wallet. Want to place an order?";
  },

  invoice_pay_deferred({ payment }) {
    if (payment) {
      return `Invoice paid.\n\nMerchant: ${payment.merchant}\nCharged: $${Number(payment.amount).toFixed(2)}\nRemaining wallet balance: $${Number(payment.wallet_balance).toFixed(2)}`;
    }
    return "Invoice payments are Phase 4.\n\nWhen it launches: forward any invoice here and I'll process it through JhaPay — with full audit trail and receipt.\n\nFor now I handle restaurant orders. Can I help with that?";
  },

  request_payment_deferred({ amount, recipient, paymentRequest }) {
    if (paymentRequest) {
      return `Payment request sent.\n\nRecipient: ${paymentRequest.recipient}\nAmount: $${Number(paymentRequest.amount).toFixed(2)}\nStatus: ${paymentRequest.status}`;
    }
    const detail = amount > 0 ? ` for $${amount.toFixed(2)}` : "";
    const to = recipient ? ` from ${recipient}` : "";
    return `Payment requests${detail}${to} are Phase 4.\n\nWhen P2P launches: send a payment request in one message and they'll receive a JhaPay link to pay.\n\nFor now, try sending them a message directly. Restaurant payments through your wallet are live today.`;
  },

  vendor_blocked() {
    return "Vendor payments involve compliance and authorization requirements that aren't live yet — and are deliberately gated even in Phase 4.\n\nPlease use your normal payment channel for vendor payments. I can help with restaurant orders and JhaPay wallet payments.";
  },

  auto_pay_deferred() {
    return "Recurring payment rules are Phase 4.\n\nWe're being careful with autopay — it requires bulletproof failure handling, dispute flows, and audit trails before it's safe to automate.\n\nComing after the core payment layer is proven. Is there a one-time payment I can help with today?";
  },

  // Rewards scenarios
  points_balance({ rewards }) {
    if (rewards) {
      return formatRewardsSummary(rewards, "Your rewards snapshot");
    }
    return "Your rewards account isn't connected yet — the loyalty engine is Phase 2.\n\nHere's what's coming: every confirmed order earns points, redeemable for free items, cashback, and exclusive deals.\n\nWant to earn your first points? Place an order now and they'll be waiting when Phase 2 launches.";
  },

  redeem_points({ rewards }) {
    if (rewards) {
      return `${formatRewardsSummary(rewards, "Points are ready to redeem")}\n\nDraft an order and say "use my rewards" to apply them automatically.`;
    }
    return "Points redemption is Phase 2.\n\nWhen it launches:\n- Redeem at any Olympic Flame Burgers location\n- Apply directly in chat (\"use my points for this order\")\n- Convert to cashback in your JhaPay wallet\n\nStart building your balance now — every order counts toward Phase 2 milestones.";
  },

  deals_nearby({ menuItems = [] }) {
    const base = "Here are the best-value items on the menu right now:\n\n";
    if (menuItems.length === 0) return base + "Ask me to show cheap eats or trending items for today's best picks.";
    return base + buildItemList(menuItems.slice(0, 4)) + "\n\nSay \"order 1\", \"order 2\", etc. to place any of these.";
  },

  best_discount({ order, rewards }) {
    if (order?.rewards_applied) {
      return `I applied the best available savings.\n\n${formatOrder(order, "Updated draft:")}\n\n${formatRewardsApplied(order.rewards_applied)}\n\nSay "confirm" to place it.`;
    }
    if (rewards) {
      return `${formatRewardsSummary(rewards, "Available savings")}\n\nDraft an order and I'll apply the best mix of coupon + points automatically.`;
    }
    return "Automatic discount stacking is Phase 2.\n\nWhen it's live, I'll scan your coupons, cashback offers, and points before every order and apply the best combination automatically — no manual hunting.\n\nFor now, I'll get your order placed as efficiently as possible.";
  },

  free_items({ rewards }) {
    if (rewards) {
      const canRedeem = Number(rewards.points_balance || 0) >= 100;
      return `${formatRewardsSummary(rewards, "Free-item progress")}\n\n${canRedeem ? "You already have enough points to unlock a reward on a draft order." : "You are still building toward your next free-item unlock."}`;
    }
    return "Free item redemption is Phase 2.\n\nWhen the loyalty engine launches:\n- Check your points balance\n- See which free items you're eligible for today\n- Claim them in one message, applied before checkout\n\nWant to start earning toward free items? Place an order now.";
  },

  cashback_offers({ offers }) {
    if (offers?.offers?.length) {
      const lines = offers.offers.map((offer) => `- ${offer.title}: ${offer.rate_percent}% back. ${offer.note}`);
      return `Cashback offers for ${offers.merchant}:\n\n${lines.join("\n")}\n\nCurrent cashback balance: $${Number(offers.cashback_balance).toFixed(2)}`;
    }
    return "Cashback offers are Phase 2.\n\nComing: merchant-specific cashback rates, triggered by location and order behavior. You'll see live cashback offers right here before you order.\n\nI can show you the best-value items on the current menu in the meantime — just ask \"cheap eats\" or \"best value\".";
  },

  apply_rewards({ order, rewards }) {
    if (order?.rewards_applied) {
      return `Rewards applied.\n\n${formatOrder(order, "Updated draft:")}\n\n${formatRewardsApplied(order.rewards_applied)}\n\nSay "confirm" to place it.`;
    }
    if (rewards) {
      return `${formatRewardsSummary(rewards, "Your rewards are ready")}\n\nDraft an order first, then say "use my rewards" and I will apply them.`;
    }
    return "Rewards redemption is Phase 2.\n\nWhen it's live: say \"use my rewards\" before confirming any order and I'll automatically apply the best available combination — points, cashback, or coupons — for the lowest final price.\n\nFor now, let me place your order and your history will be ready for Phase 2.";
  },

  deal_alerts({ alert }) {
    if (alert?.saved) {
      return `Deal alert saved for "${alert.saved}".\n\nActive alerts: ${alert.alerts.join(", ")}`;
    }
    return "Deal alerts are Phase 2.\n\nWhen the loyalty engine launches, you set this once and I'll notify you the moment a matching deal drops at your nearest location — push notification or in-app alert, whichever you prefer.\n\nI'll note \"burger deal alert\" for your profile. Anything else I can help with today?";
  },

  milestone_check({ rewards }) {
    if (rewards?.milestone) {
      return `Milestone progress:\n\nCurrent points: ${rewards.milestone.current_points}\nNext target: ${rewards.milestone.next_target}\nPoints remaining: ${rewards.milestone.remaining_points}`;
    }
    return "Milestone tracking is Phase 2.\n\nHere's a preview of how it'll work: every order moves you toward free meals, exclusive combos, and cashback tiers. I'll show your progress right in this chat after every order.\n\nStart building your history now — every confirmed order gets counted toward your Phase 2 milestone.";
  },

  stack_coupons({ order, rewards }) {
    if (order?.rewards_applied) {
      return `Best stack applied.\n\n${formatOrder(order, "Updated draft:")}\n\n${formatRewardsApplied(order.rewards_applied)}\n\nSay "confirm" to place it.`;
    }
    if (rewards) {
      return `${formatRewardsSummary(rewards, "Available coupons and points")}\n\nDraft an order and I'll stack the best eligible savings for you automatically.`;
    }
    return "Coupon stacking is Phase 2, with carefully defined rules to prevent abuse.\n\nWhen it's live, I'll handle the stacking logic automatically — you won't need to figure out which coupons combine. I'll just show you the lowest price I can get you.\n\nAnything I can help with on today's menu?";
  },

  // History scenarios
  tx_history({ transactions }) {
    if (transactions?.length) {
      return `Recent transactions:\n\n${formatTransactions(transactions)}`;
    }
    return "No transactions yet in this session. Once you pay, recharge, or close a check, I will show them here.";
  },

  spend_insights({ insights }) {
    if (insights) {
      const topMerchant = insights.top_merchant ? `Top merchant: ${insights.top_merchant.name} ($${Number(insights.top_merchant.amount).toFixed(2)})` : "Top merchant: none yet";
      return `Spend insights for the last ${insights.days} days:\n\nTotal spend: $${Number(insights.total_spend).toFixed(2)}\nTransactions: ${insights.transaction_count}\nAverage ticket: $${Number(insights.average_ticket).toFixed(2)}\n${topMerchant}\nWallet balance: $${Number(insights.wallet_balance).toFixed(2)}`;
    }
    return "Spend insights are Phase 1B.\n\nComing: \"What did I spend this week?\" returns a breakdown by location, category, and day — with weekly and monthly trends.\n\nYour demo wallet shows $50.00 remaining. Real spend tracking connects to your actual JhaPay transaction history when Phase 1B launches.";
  },

  order_history({ history }) {
    if (history?.orders?.length) {
      return `Order history:\n\n${formatOrderHistory(history.orders)}\n\nFavorites: ${formatFavorites(history.favorites)}\n${history.usual_order ? "Say \"order my usual\" any time and I will draft it." : ""}`;
    }
    return "You do not have confirmed orders yet in this session. Place one order and I will start building your history right away.";
  },

  receipts({ receipts }) {
    if (receipts?.length) {
      return `Recent receipts:\n\n${formatReceipts(receipts)}`;
    }
    return "No receipts yet in this session. Confirm an order and I will generate a receipt reference here.";
  },

  // Smart AI scenarios
  meal_suggestion({ menuItems = [], personalized = false }) {
    const base = personalized
      ? "Based on your order history, these look like strong fits:\n\n"
      : "Personalized suggestions from your order history are Phase 3.\n\nWhen it's live: I'll know what you ordered, how often, and what you skipped — and suggest items that match your actual taste profile.\n\nRight now, here's what everyone's ordering most:\n\n";
    if (menuItems.length === 0) return base + "Ask me \"what's trending\" to see the top picks.";
    return base + buildItemList(menuItems.slice(0, 3)) + "\n\nSay \"order 1\" to draft any of these.";
  },

  similar_place({ restaurants = [] }) {
    const base = "Merchant similarity recommendations are Phase 3.\n\nWhen it's live: I'll surface places similar in cuisine, price range, and vibe — based on actual order overlap from JhaPay users.\n\n";
    if (restaurants.length > 0) {
      const list = restaurants.filter((r) => !r.is_demo).slice(0, 3).map((r, i) => `${i + 1}. ${r.name} — ${r.city}, ${r.state}`);
      return base + `For now, here are the Olympic Flame Burgers locations:\n\n${list.join("\n")}\n\nWant to order from one of these?`;
    }
    return base + "For now I can show all Olympic Flame Burgers locations — just ask \"show locations\".";
  },

  friend_meal({ friendName }) {
    const name = friendName || "your friend";
    return `Shared preferences and social ordering are Phase 3.\n\nThe vision: "order ${name}'s usual" pulls from their saved favorites (with their permission) and drafts it for you in one step.\n\nFor now, what would you like to order? I can suggest today's most popular items if that helps.`;
  },

  behavior_rec({ menuItems = [], personalized = false }) {
    const base = personalized
      ? "I used your recent orders and favorites to rank these for you:\n\n"
      : "Behavior-based recommendations are Phase 3.\n\nHere's the vision: I'll analyze your reorder patterns, favorite items, time-of-day preferences, and budget — and suggest what you actually want before you even ask.\n\nSince we don't have your history yet, here's what the crowd is ordering right now:\n\n";
    if (menuItems.length === 0) return base + "Ask me \"what's trending\" for the current top picks.";
    return base + buildItemList(menuItems.slice(0, 3)) + "\n\nSay \"order 1\" to draft any of these.";
  },

  group_plan({ budget, groupSize, menuItems = [] }) {
    const perPerson = budget > 0 && groupSize > 0 ? budget / groupSize : 0;
    const header = `Group order for ${groupSize || "your group"} under $${budget || "budget"}${perPerson > 0 ? ` ($${perPerson.toFixed(2)}/person)` : ""}.\n\nGroup planning is Phase 3, but here's what I'd suggest right now:\n\n`;

    if (menuItems.length === 0 || !budget || !groupSize) {
      return header + "Ask me for specific combos or items and I'll help build your order.";
    }

    // Try to build a balanced group spread within budget
    const combos = menuItems.filter((i) => i.tags?.includes("combo") || i.name.toLowerCase().includes("combo")).sort((a, b) => a.price - b.price);
    const suggestions = [];
    let total = 0;
    let remaining = groupSize;

    for (const item of combos) {
      if (remaining <= 0 || total + item.price > budget + 2) break;
      const qty = Math.min(remaining, Math.floor((budget - total) / item.price));
      if (qty > 0) {
        suggestions.push({ item, qty });
        total += item.price * qty;
        remaining -= qty;
      }
    }

    if (suggestions.length === 0) {
      return header + "I couldn't find a perfect combo spread under that budget. Try asking for individual items and I'll draft the order.";
    }

    const lines = suggestions.map((s) => `- ${s.qty} x ${s.item.name} — $${(s.item.price * s.qty).toFixed(2)}`);
    const overUnder = total <= budget ? `Under budget by $${(budget - total).toFixed(2)}.` : `$${(total - budget).toFixed(2)} over — swap one item to save.`;
    return `${header}${lines.join("\n")}\n\nTotal: $${total.toFixed(2)}. ${overUnder}\n\nWant me to draft this group order?`;
  }
};

// ─── Main Answer Entry ────────────────────────────────────────────────────────

async function answerWithBrain({ message, context, pendingOrder, ragInput = null }) {
  const pillar = reasonPillar(message || "");
  const deterministicReply = localAnswer({ message, context, pendingOrder });

  if (!process.env.OPENAI_API_KEY) return deterministicReply;
  if (shouldUseDeterministicReply({ context, pillar })) return deterministicReply;

  const ragContext = await buildRagContext({ message, pillar, pendingOrder, ragInput });
  const aiAnswer = await callOpenAiCompatibleApi({ message, context, pendingOrder, pillar, ragContext });
  return aiAnswer || deterministicReply;
}

function shouldUseDeterministicReply({ context, pillar }) {
  if (pillar === "blocked") return true;
  const intent = context?.intent || "";
  if (!intent) return false;
  return !RAG_ELIGIBLE_INTENTS.has(intent);
}

async function buildRagContext({ message, pillar, pendingOrder, ragInput }) {
  if (!ragInput?.rag?.retrievePillarContext) return null;
  try {
    return await ragInput.rag.retrievePillarContext({
      pillar,
      query: message,
      sessionId: ragInput.sessionId,
      restaurantId: ragInput.restaurantId,
      session: ragInput.session,
      pendingOrder
    });
  } catch (error) {
    console.warn(`[rag] Retrieval skipped: ${error.message}`);
    return null;
  }
}

function localAnswer({ message, context, pendingOrder }) {
  const pillar = reasonPillar(message || "");

  // Safety
  if (pillar === "blocked" || context.intent === "blocked") {
    return "Sorry, I cannot help with sales counts or private business data. I can help with the menu, locations, hours, or placing an order.";
  }

  // Dispatch on intent
  const { intent } = context;

  if (RESPONSES[intent]) return RESPONSES[intent](context);

  // Discovery
  if (intent === "discovery_answer") {
    return buildDiscoveryReply({ menuItems: context.menuItems || [], restaurants: context.restaurants || [], discoveryMeta: context.discoveryMeta || {} });
  }

  // Pillar gates (fallbacks if intent not set by server)
  if (intent === "payments_info" || (pillar === CAPABILITY_PILLARS.PAYMENTS && !pendingOrder && !wantsOrder(message || ""))) {
    return "I can help with JhaPay wallet actions right here: recharge your wallet, split a bill, send a payment request, pay by QR, or close a check with tip. If you're paying for food, I can also charge your draft order once you confirm it.";
  }
  if (intent === "rewards_info" || pillar === CAPABILITY_PILLARS.REWARDS) {
    if (context.rewards) return formatRewardsSummary(context.rewards, "Rewards and savings");
    return "Rewards, points, and coupons are available in this demo. Ask for your points balance, cashback offers, best discount, or say \"use my rewards\" on a draft order.";
  }

  // Location list
  if (intent === "locations") {
    const locations = (context.restaurants || []).slice(0, 10).map((r) => {
      const label = r.is_demo ? " [demo]" : " [live]";
      return `${r.name}${label}: ${r.address}, ${r.city}, ${r.state} — ${r.phone || "phone unavailable"}`;
    });
    return `Here are the available locations:\n${locations.join("\n")}`;
  }

  // Order states
  if (intent === "order_confirmed") return `${formatOrder(context.order, "Your order is confirmed.")}\nEstimated pickup time: ${context.order.estimated_pickup_minutes || 18} minutes.\nPoints earned: ${context.order.payment_summary?.points_earned || 0}\nCashback earned: $${Number(context.order.payment_summary?.cashback_earned || 0).toFixed(2)}\nEnjoy your food.`;
  if (intent === "order_cancelled") return "No problem, I cancelled that draft order. Nothing was charged.";
  if (intent === "order_draft") return `${formatOrder(context.order, "I drafted this order.")}\nSay "confirm" to place it, or "cancel" to remove it.`;
  if (intent === "needs_order_confirmation" && pendingOrder) return `${formatOrder(pendingOrder, "I still have this draft order ready.")}\nSay "confirm" to place it.`;

  // Menu answer — list items with prices
  if (intent === "menu_answer") {
    const items = context.menuItems || [];
    if (items.length === 0) return "I didn't find anything matching that. Try: \"best burgers under $15\", \"vegan options\", or \"what's trending\".";
    const header = context.serviceContext?.recommendation_note || `Here are the best matches:`;
    return `${header}\n\n${buildItemList(items)}\n\nSay "order 1", "order 2", etc. to place any of these.`;
  }

  return "I can help with the menu, restaurant locations, hours, and placing orders. Try: \"best burgers under $15\", \"vegan options\", \"trending places\", or \"plan dinner for 4 under $60\".";
}

function formatOrder(order, heading) {
  const lines = order.items.map((i) => `- ${i.quantity} x ${i.item_name} — $${(i.unit_price * i.quantity).toFixed(2)}`);
  const paymentSummary = order.payment_summary || {};
  const discountLine = Number(paymentSummary.discount_total || 0) > 0 ? `Discounts: -$${Number(paymentSummary.discount_total).toFixed(2)}\n` : "";
  const totalLine = `Total: $${Number(paymentSummary.charged_total || order.final_total || order.subtotal).toFixed(2)}`;
  const walletLine = order.jhapay_wallet ? `JhaPay remaining: $${Number(order.jhapay_wallet.remaining_after).toFixed(2)}` : "";
  return `${heading}\nOrder #${order.display_order_id}\n${lines.join("\n")}\nSubtotal: $${Number(order.subtotal).toFixed(2)}\n${discountLine}${totalLine}\nPickup: ${order.pickup_location || `${order.restaurant?.name}, ${order.restaurant?.city}`}\n${walletLine}`;
}

function formatRewardsSummary(rewards, heading) {
  const couponLine = rewards.available_coupons?.length
    ? rewards.available_coupons.map((coupon) => `${coupon.code} (${coupon.label})`).join(", ")
    : "No coupons loaded yet.";
  const favoriteLine = rewards.favorites?.length
    ? rewards.favorites.map((item) => `${item.item_name} x${item.quantity}`).join(", ")
    : "No favorites yet.";
  return `${heading}\nPoints: ${rewards.points_balance}\nCashback balance: $${Number(rewards.cashback_balance || 0).toFixed(2)}\nCoupons: ${couponLine}\nMilestone: ${rewards.milestone.current_points}/${rewards.milestone.next_target} points\nFavorites: ${favoriteLine}`;
}

function formatRewardsApplied(rewardsApplied) {
  const parts = [];
  if (rewardsApplied.coupon_code) {
    parts.push(`Coupon ${rewardsApplied.coupon_code}: -$${Number(rewardsApplied.coupon_discount || 0).toFixed(2)}`);
  }
  if (rewardsApplied.points_used) {
    parts.push(`Points used: ${rewardsApplied.points_used} (-$${Number(rewardsApplied.points_discount || 0).toFixed(2)})`);
  }
  if (rewardsApplied.cashback_preview) {
    parts.push(`Cashback after purchase: $${Number(rewardsApplied.cashback_preview).toFixed(2)}`);
  }
  return parts.join("\n");
}

function formatTransactions(transactions) {
  return transactions
    .map((tx) => `- ${tx.type}: ${tx.direction === "credit" ? "+" : "-"}$${Number(tx.amount || 0).toFixed(2)} at ${tx.merchant} (${new Date(tx.created_at).toLocaleDateString("en-US")})`)
    .join("\n");
}

function formatOrderHistory(orders) {
  return orders
    .map((order) => {
      const items = order.items.map((item) => `${item.quantity} x ${item.item_name}`).join(", ");
      const total = Number(order.payment_summary?.charged_total || order.subtotal || 0).toFixed(2);
      return `- #${order.display_order_id} | $${total} | ${order.restaurant?.city || order.restaurant?.name || "Restaurant"} | ${items}`;
    })
    .join("\n");
}

function formatFavorites(favorites = []) {
  if (!favorites.length) return "No favorites yet.";
  return favorites.map((item) => `${item.item_name} x${item.quantity}`).join(", ");
}

function formatReceipts(receipts) {
  return receipts
    .map((receipt) => `- ${receipt.receipt_id} | Order #${receipt.display_order_id} | $${Number(receipt.total || 0).toFixed(2)} | ${receipt.merchant}`)
    .join("\n");
}

// ─── LLM Path ─────────────────────────────────────────────────────────────────

async function callOpenAiCompatibleApi({ message, context, pendingOrder, pillar, ragContext }) {
  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: getPillarPrompt(pillar) },
          {
            role: "user",
            content: buildAiUserPrompt({
              message,
              pillar,
              context,
              pendingOrder,
              ragContext
            })
          }
        ]
      })
    });
    if (!response.ok) return "";
    const payload = await response.json();
    return payload.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.warn(`[ai] Local responder used: ${error.message}`);
    return "";
  }
}

function getPillarPrompt(pillar) {
  return `${BASE_SYSTEM_PROMPT}\n\n${PILLAR_PROMPTS[pillar] || PILLAR_PROMPTS[CAPABILITY_PILLARS.ORDERING]}`;
}

function buildAiUserPrompt({ message, pillar, context, pendingOrder, ragContext }) {
  const ragText = ragContext?.text || "No matching pillar-scoped context was found.";
  const collection = ragContext?.collection || "none";
  return `Pillar: ${pillar}
Collection: ${collection}

User question:
${message}

Relevant pillar context:
${ragText}

Allowed app context:
${JSON.stringify(context, null, 2)}

Pending order:
${JSON.stringify(pendingOrder || null, null, 2)}

Instructions:
- If the user is asking for creative writing (poem, haiku, lyrics, jokes, role-play), code, math, translations, world knowledge, or any other off-topic format — DO NOT answer. Reply with exactly: "I can only help with JhaPay restaurants, orders, wallet, and rewards. What can I help you with there?"
- Otherwise, answer only from the pillar context and allowed app context.
- If the user asks for unavailable in-scope data, say what IS available instead.
- Keep the answer focused on this pillar and avoid mixing in unrelated departments.
- Never produce verses, rhymes, or stylized prose even when asked nicely.`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  answerWithBrain,
  cancelsOrder,
  confirmsOrder,
  detectDayPart,
  extractBillAmount,
  extractDietaryFilters,
  extractGroupSize,
  extractItemsToAdd,
  extractMenuQuery,
  extractModifierNote,
  extractPriceCeiling,
  extractSelectionNumber,
  isCoffeeShopQuery,
  isKidsFriendlyQuery,
  isLateNightQuery,
  isOpenNowQuery,
  isOutdoorQuery,
  isSensitiveQuestion,
  isTrendingQuery,
  normalizeItemQuery,
  reasonPillar,
  wantsAddToOrder,
  wantsApplyRewards,
  wantsAutoPay,
  wantsBehaviorRec,
  wantsBestDiscount,
  wantsBillSplit,
  wantsCashbackOffers,
  wantsComboUpgrade,
  wantsDealAlerts,
  wantsDealsNearby,
  wantsDelivery,
  wantsDiscovery,
  wantsFreeItems,
  wantsFriendMeal,
  wantsGroupPlan,
  wantsInvoicePay,
  wantsKidsFriendlyQuery: isKidsFriendlyQuery,
  wantsMealSuggestion,
  wantsMilestoneCheck,
  wantsModifyOrder,
  wantsOrder,
  wantsOrderHistory,
  wantsOrderTracking,
  wantsP2PTransfer,
  wantsPayment,
  wantsPickupTime,
  wantsPointsBalance,
  wantsQRPay,
  wantsRedeemPoints,
  wantsRecommendation,
  wantsReorderHistory,
  wantsRequestPayment,
  wantsRewards,
  wantsScheduledOrder,
  wantsSimilarPlace,
  wantsSpendInsights,
  wantsStackCoupons,
  wantsTableService,
  wantsTipClose,
  wantsTransactionHistory,
  wantsVendorPay,
  wantsWalletRecharge,
  CAPABILITY_PILLARS,
  PHASE1_SCOPE
};
