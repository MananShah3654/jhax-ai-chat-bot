require("dotenv").config();
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createStore } = require("./db");
const { createMcpEngine } = require("./mcpEngine");
const { createRagEngine } = require("./rag");
const {
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
  wantsRecommendation,
  wantsRedeemPoints,
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
  CAPABILITY_PILLARS
} = require("./aiBrain");

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");
const sessions = new Map();

async function main() {
  const handler = await createRequestHandler();
  const server = http.createServer(handler);
  server.listen(PORT, () => console.log(`AI restaurant demo API listening on http://localhost:${PORT}`));
}

async function createRequestHandler(options = {}) {
  const store = await createStore();
  const mcp = createMcpEngine(store);
  const rag = createRagEngine({ mcp });
  return makeRequestHandler({ store, mcp, rag, serveStaticFiles: options.serveStaticFiles !== false });
}

let vercelHandlerPromise;
async function vercelHandler(req, res) {
  if (!vercelHandlerPromise) vercelHandlerPromise = createRequestHandler({ serveStaticFiles: true });
  return (await vercelHandlerPromise)(req, res);
}

function makeRequestHandler({ store, mcp, rag, serveStaticFiles }) {
  return async (req, res) => {
    try {
      addCors(req, res);
      if (req.method === "OPTIONS") return sendJson(res, 204, {});

      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
        return sendJson(res, 200, { ok: true, mode: store.mode });
      }
      if (req.method === "GET" && (url.pathname === "/mcp/tools" || url.pathname === "/api/mcp/tools")) {
        return sendJson(res, 200, { tools: mcp.definitions });
      }
      if (req.method === "GET" && url.pathname === "/api/restaurants") {
        return sendJson(res, 200, { restaurants: await mcp.execute("list_restaurants", {}, "api") });
      }
      if (req.method === "GET" && url.pathname === "/api/menu/search") {
        const menuItems = await mcp.execute("search_menu", {
          q: url.searchParams.get("q") || "",
          day_part: url.searchParams.get("day_part") || "",
          restaurant_id: url.searchParams.get("restaurant_id") || "",
          limit: Number(url.searchParams.get("limit") || 8)
        }, "api");
        return sendJson(res, 200, { menuItems });
      }

      // ── Streaming chat (SSE) ──────────────────────────────────────────────
      if (req.method === "POST" && (url.pathname === "/api/chat/stream" || url.pathname === "/chat/stream")) {
        const body = await readJson(req);
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || `http://${req.headers.host}`,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type"
        });
        const result = await handleChat({ body, mcp, rag });
        await streamTokens(res, result);
        return;
      }

      // ── Non-streaming chat ────────────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = await readJson(req);
        return sendJson(res, 200, await handleChat({ body, mcp, rag }));
      }

      if (req.method === "POST" && url.pathname === "/api/orders/draft") {
        const body = await readJson(req);
        const sessionId = body.sessionId || "api";
        const order = await mcp.execute("create_order_draft", {
          restaurant_id: body.restaurantId,
          items: normalizeOrderItems(body.items),
          customer_name: body.customerName,
          customer_phone: body.customerPhone,
          notes: body.notes
        }, sessionId);
        if (body.sessionId) {
          const session = sessions.get(body.sessionId) || { pendingOrder: null, lastMenuItems: [] };
          session.pendingOrder = order;
          sessions.set(body.sessionId, session);
        }
        return sendJson(res, 201, { order });
      }

      const confirmMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/confirm$/);
      if (req.method === "POST" && confirmMatch) {
        return sendJson(res, 200, { order: await mcp.execute("confirm_order", { order_id: confirmMatch[1] }, "api") });
      }

      const cancelMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
      if (req.method === "POST" && cancelMatch) {
        return sendJson(res, 200, { order: await mcp.execute("cancel_order", { order_id: cancelMatch[1] }, "api") });
      }

      const getOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (req.method === "GET" && getOrderMatch) {
        const order = await mcp.execute("get_order", { order_id: getOrderMatch[1] }, "api");
        return sendJson(res, order ? 200 : 404, { order });
      }

      if (serveStaticFiles && req.method === "GET") return serveStatic(req, res, url.pathname);
      return sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      console.error(error);
      return sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
    }
  };
}

// ─── SSE Streaming ────────────────────────────────────────────────────────────

async function streamTokens(res, result) {
  const { reply = "", context = {}, sessionId = "" } = result;
  const tokens = reply.split(/(\s+)/);
  for (const token of tokens) {
    if (!token) continue;
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
    // Natural pacing: pause on punctuation
    const ms = /[.!?]$/.test(token) ? 80 : /[,;:]$/.test(token) ? 35 : /\n/.test(token) ? 50 : 22;
    await tick(ms);
  }
  res.write(`data: ${JSON.stringify({ done: true, context, sessionId })}\n\n`);
  res.end();
}

function tick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Discovery Context ────────────────────────────────────────────────────────

async function buildDiscoveryContext(message, mcp, sessionId, restaurantId) {
  const priceCeiling = extractPriceCeiling(message);
  const dietaryFilters = extractDietaryFilters(message);
  const lateNight = isLateNightQuery(message);
  const openNow = isOpenNowQuery(message);
  const kidsFriendly = isKidsFriendlyQuery(message);
  const outdoorSeating = isOutdoorQuery(message);
  const coffeeShop = isCoffeeShopQuery(message);
  const trending = isTrendingQuery(message);
  const halalOnly = dietaryFilters.includes("halal");
  const wantsRestaurantList = /\b(restaurant|place|spot|location|where to eat|dining)\b/i.test(message);

  let restaurants = null;
  if (wantsRestaurantList || openNow) {
    restaurants = await mcp.execute("list_restaurants", {}, sessionId);
  }

  let items = [];
  if (!lateNight && !outdoorSeating && !coffeeShop && !(halalOnly && dietaryFilters.length === 1)) {
    let q = "";
    if (isKidsFriendlyQuery(message)) q = "kids";
    else if (trending || wantsRestaurantList || /\b(cheap|budget|affordable|cheap eats|value)\b/i.test(message)) q = "";
    else if (/\b(vegan|vegetarian|healthy)\b/i.test(message)) q = "vegetarian";
    else q = extractMenuQuery(message) || "";

    items = await mcp.execute("search_menu", { q, restaurant_id: restaurantId, limit: 20 }, sessionId);

    if (priceCeiling > 0) items = items.filter((i) => i.price <= priceCeiling);
    if (dietaryFilters.includes("vegan") || dietaryFilters.includes("vegetarian")) items = items.filter((i) => i.tags.includes("vegetarian"));
    if (dietaryFilters.includes("gluten-free")) items = items.filter((i) => !i.allergens.includes("wheat"));
    if (isKidsFriendlyQuery(message)) items = items.filter((i) => i.tags.includes("kids"));

    items = [...items].sort((a, b) => (b.demand_score || 0) - (a.demand_score || 0) || a.price - b.price).slice(0, 5);
  }

  return { items, restaurants, discoveryMeta: { priceCeiling, dietaryFilters, lateNight, openNow, kidsFriendly, outdoorSeating, halalOnly, coffeeShop, wantsRestaurantList, isTrending: trending } };
}

// ─── Chat Handler ─────────────────────────────────────────────────────────────

async function handleChat({ body, mcp, rag }) {
  const sessionId = body.sessionId || cryptoSessionId();
  const session = sessions.get(sessionId) || { pendingOrder: null, lastMenuItems: [] };
  const message = String(body.message || "");
  const restaurantId = body.restaurantId || "";

  function reply(context) {
    return answerWithBrain({
      message,
      context,
      pendingOrder: session.pendingOrder,
      ragInput: {
        rag,
        sessionId,
        restaurantId,
        session
      }
    }).then((r) => ({ sessionId, reply: r, context }));
  }

  // 1. Safety
  if (isSensitiveQuestion(message)) return reply({ intent: "blocked" });

  // 2. Vendor payment (always blocked)
  if (wantsVendorPay(message)) return reply({ intent: "vendor_blocked" });

  // 3. Confirm / cancel pending order
  if (session.pendingOrder && confirmsOrder(message)) {
    const order = await mcp.execute("confirm_order", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = null; sessions.set(sessionId, session);
    return reply({ intent: "order_confirmed", order });
  }
  if (session.pendingOrder && cancelsOrder(message)) {
    const order = await mcp.execute("cancel_order", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = null; sessions.set(sessionId, session);
    return reply({ intent: "order_cancelled", order });
  }

  // 4. Combo upgrade (must check before generic add)
  if (session.pendingOrder && wantsComboUpgrade(message)) {
    const currentName = session.pendingOrder.items[0]?.item_name || "";
    const baseName = currentName.replace(/\bcombo\b/gi, "").trim();
    const comboResults = await mcp.execute("search_menu", { q: baseName + " combo", limit: 5 }, sessionId);
    const comboItem = comboResults.find(
      (i) => i.name.toLowerCase().includes("combo") && i.id !== session.pendingOrder.items[0]?.menu_item_id
    );
    if (comboItem) {
      await mcp.execute("cancel_order", { order_id: session.pendingOrder.id }, sessionId);
      const order = await mcp.execute("create_order_draft", {
        restaurant_id: restaurantId,
        items: [{ menuItemId: comboItem.id, quantity: 1 }],
        notes: `Upgraded from ${currentName} to combo`
      }, sessionId);
      session.pendingOrder = order; sessions.set(sessionId, session);
      return reply({ intent: "combo_upgraded", order });
    }
    return reply({ intent: "combo_not_found", currentItemName: currentName });
  }

  // 5a. Add to order — no active draft
  if (!session.pendingOrder && wantsAddToOrder(message)) {
    return reply({ intent: "add_to_order_no_draft" });
  }

  // 5b. Add items to pending order
  if (session.pendingOrder && wantsAddToOrder(message)) {
    const queries = extractItemsToAdd(message);
    if (queries.length > 0) {
      const newItems = [];
      const addedNames = [];
      for (const q of queries) {
        const found = await mcp.execute("search_menu", { q, limit: 1 }, sessionId);
        if (found[0]) { newItems.push({ menuItemId: found[0].id, quantity: 1 }); addedNames.push(found[0].name); }
      }
      if (newItems.length > 0) {
        const existingItems = session.pendingOrder.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, notes: i.notes }));
        await mcp.execute("cancel_order", { order_id: session.pendingOrder.id }, sessionId);
        const order = await mcp.execute("create_order_draft", {
          restaurant_id: restaurantId || session.pendingOrder.restaurant_id,
          items: [...existingItems, ...newItems],
          notes: session.pendingOrder.notes
        }, sessionId);
        session.pendingOrder = order; sessions.set(sessionId, session);
        return reply({ intent: "order_updated", order, addedNames });
      }
    }
  }

  // 6. Modify order (add note)
  if (session.pendingOrder && wantsModifyOrder(message)) {
    const modifier = extractModifierNote(message);
    const existingItems = session.pendingOrder.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, notes: i.notes }));
    await mcp.execute("cancel_order", { order_id: session.pendingOrder.id }, sessionId);
    const order = await mcp.execute("create_order_draft", {
      restaurant_id: restaurantId || session.pendingOrder.restaurant_id,
      items: existingItems,
      notes: modifier
    }, sessionId);
    session.pendingOrder = order; sessions.set(sessionId, session);
    return reply({ intent: "order_modified", order, modifier });
  }

  // 7. Selection by number
  const selectionNumber = extractSelectionNumber(message);
  if (selectionNumber > 0 && session.lastMenuItems?.[selectionNumber - 1]) {
    const selectedItem = session.lastMenuItems[selectionNumber - 1];
    const order = await mcp.execute("create_order_draft", {
      restaurant_id: restaurantId,
      items: [{ menuItemId: selectedItem.id, quantity: 1 }],
      notes: `Drafted from selection #${selectionNumber}: ${selectedItem.name}`
    }, sessionId);
    session.pendingOrder = order; sessions.set(sessionId, session);
    return reply({ intent: "order_draft", order, matchedItem: selectedItem });
  }

  // 8. Ordering sub-scenarios
  if (wantsOrderTracking(message)) {
    return reply({ intent: "order_status_active", order: session.pendingOrder });
  }
  if (wantsReorderHistory(message)) {
    const order = await mcp.execute("reorder_last_order", {
      restaurant_id: restaurantId || session.pendingOrder?.restaurant_id || "",
      use_usual: /\b(usual|same as last time|my usual)\b/i.test(message)
    }, sessionId);
    if (!order) return reply({ intent: "reorder_unavailable", message });
    session.pendingOrder = order; sessions.set(sessionId, session);
    return reply({ intent: "reorder_ready", order, source: /\b(usual|same as last time|my usual)\b/i.test(message) ? "usual" : "recent" });
  }
  if (wantsTableService(message)) {
    return reply({ intent: "table_service_deferred" });
  }
  if (wantsScheduledOrder(message)) {
    const timeMatch = message.match(/\d+(?::\d+)?\s*[ap]m|\d+\s*(?:pm|am)/i);
    return reply({ intent: "scheduled_deferred", scheduledTime: timeMatch?.[0] || null });
  }
  if (wantsPickupTime(message) && !session.pendingOrder) {
    const minsMatch = message.match(/(\d+)\s*min/i);
    return reply({ intent: "pickup_time_set", minutes: minsMatch ? minsMatch[1] : "15", order: null });
  }
  if (wantsDelivery(message) && !session.pendingOrder) {
    return reply({ intent: "delivery_noted", order: null });
  }

  // 9. Payment sub-scenarios
  if (wantsAutoPay(message)) return reply({ intent: "auto_pay_deferred" });
  if (wantsBillSplit(message)) {
    const amount = extractBillAmount(message) || session.pendingOrder?.final_total || session.pendingOrder?.subtotal || 0;
    const groupSize = extractGroupSize(message) || (message.match(/between\s+(\d+)/i)?.[1] ? parseInt(message.match(/between\s+(\d+)/i)[1]) : 0);
    const split = await mcp.execute("split_bill", { amount, people: groupSize || 2 }, sessionId);
    return reply({ intent: "bill_split_deferred", split });
  }
  if (wantsP2PTransfer(message)) {
    const amount = extractBillAmount(message);
    const recipientMatch = message.match(/to\s+([A-Z][a-z]+)/);
    return reply({ intent: "p2p_deferred", amount, recipient: recipientMatch?.[1] || null });
  }
  if (wantsTipClose(message)) {
    const amount = extractBillAmount(message) || session.pendingOrder?.final_total || session.pendingOrder?.subtotal || 0;
    const tipPercent = Number(message.match(/(\d+)\s*%/)?.[1] || 18);
    const payment = await mcp.execute("tip_and_close", { amount, tip_percent: tipPercent }, sessionId);
    return reply({ intent: "tip_close_deferred", payment });
  }
  if (wantsWalletRecharge(message)) {
    const amount = extractBillAmount(message) || Number(message.match(/\$?\s*(\d+(?:\.\d+)?)/)?.[1]) || 100;
    const recharge = await mcp.execute("recharge_wallet", { amount }, sessionId);
    return reply({ intent: "wallet_recharge_deferred", recharge });
  }
  if (wantsQRPay(message)) {
    const amount = extractBillAmount(message) || session.pendingOrder?.final_total || session.pendingOrder?.subtotal || 18.75;
    const merchant = session.pendingOrder?.restaurant?.name || "QR merchant";
    const payment = await mcp.execute("create_qr_payment", { amount, merchant }, sessionId);
    return reply({ intent: "qr_pay_deferred", payment });
  }
  if (wantsInvoicePay(message)) {
    const amount = extractBillAmount(message) || 42.5;
    const merchantMatch = message.match(/invoice(?: from| for)?\s+([a-z0-9 &'-]+)/i);
    const payment = await mcp.execute("pay_invoice", { amount, merchant: merchantMatch?.[1] || "Invoice merchant" }, sessionId);
    return reply({ intent: "invoice_pay_deferred", payment });
  }
  if (wantsRequestPayment(message)) {
    const amount = extractBillAmount(message);
    const recipientMatch = message.match(/from\s+([A-Z][a-z]+)/i);
    const paymentRequest = await mcp.execute("request_payment", {
      amount: amount || 24,
      recipient: recipientMatch?.[1] || "your friend"
    }, sessionId);
    return reply({ intent: "request_payment_deferred", paymentRequest });
  }
  if (wantsPayment(message) && !wantsOrder(message)) return reply({ intent: "payments_info" });

  // 10. Rewards sub-scenarios
  if (wantsPointsBalance(message)) {
    const rewards = await mcp.execute("get_rewards_summary", {}, sessionId);
    return reply({ intent: "points_balance", rewards });
  }
  if (wantsRedeemPoints(message)) {
    if (session.pendingOrder) {
      const order = await mcp.execute("apply_best_rewards", { order_id: session.pendingOrder.id }, sessionId);
      session.pendingOrder = order; sessions.set(sessionId, session);
      return reply({ intent: "apply_rewards", order, rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
    }
    return reply({ intent: "redeem_points", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  }
  if (wantsDealsNearby(message)) {
    const items = await mcp.execute("search_menu", { q: "", limit: 8 }, sessionId);
    const topValue = items.sort((a, b) => (b.demand_score || 0) - (a.demand_score || 0) || a.price - b.price).slice(0, 4);
    session.lastMenuItems = topValue; sessions.set(sessionId, session);
    return reply({ intent: "deals_nearby", menuItems: topValue });
  }
  if (wantsBestDiscount(message)) {
    if (session.pendingOrder) {
      const order = await mcp.execute("apply_best_rewards", { order_id: session.pendingOrder.id }, sessionId);
      session.pendingOrder = order; sessions.set(sessionId, session);
      return reply({ intent: "best_discount", order, rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
    }
    return reply({ intent: "best_discount", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  }
  if (wantsFreeItems(message)) return reply({ intent: "free_items", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  if (wantsCashbackOffers(message)) {
    const offers = await mcp.execute("get_cashback_offers", { restaurant_id: restaurantId }, sessionId);
    return reply({ intent: "cashback_offers", offers });
  }
  if (wantsApplyRewards(message)) {
    if (!session.pendingOrder) return reply({ intent: "apply_rewards", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
    const order = await mcp.execute("apply_best_rewards", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = order; sessions.set(sessionId, session);
    return reply({ intent: "apply_rewards", order, rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  }
  if (wantsDealAlerts(message)) {
    const keywordMatch = message.match(/\b(burger|taco|combo|breakfast|deals?)\b/i);
    const alert = await mcp.execute("save_deal_alert", { query: keywordMatch?.[1] || "burger deals" }, sessionId);
    return reply({ intent: "deal_alerts", alert });
  }
  if (wantsMilestoneCheck(message)) return reply({ intent: "milestone_check", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  if (wantsStackCoupons(message)) {
    if (!session.pendingOrder) return reply({ intent: "stack_coupons", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
    const order = await mcp.execute("apply_best_rewards", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = order; sessions.set(sessionId, session);
    return reply({ intent: "stack_coupons", order, rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });
  }
  if (wantsRewards(message) && !wantsOrder(message)) return reply({ intent: "rewards_info", rewards: await mcp.execute("get_rewards_summary", {}, sessionId) });

  // 11. Smart AI + History (behavior rec before order history — shares "past orders" keyword)
  if (wantsBehaviorRec(message)) {
    const items = await mcp.execute("get_personalized_recommendations", { restaurant_id: restaurantId, limit: 6 }, sessionId);
    session.lastMenuItems = items; sessions.set(sessionId, session);
    return reply({ intent: "behavior_rec", menuItems: items, personalized: true });
  }

  // 11c. History
  if (wantsTransactionHistory(message)) return reply({ intent: "tx_history", transactions: await mcp.execute("get_transaction_history", { limit: 5 }, sessionId) });
  if (wantsSpendInsights(message)) return reply({ intent: "spend_insights", insights: await mcp.execute("get_spend_insights", { days: 7 }, sessionId) });
  if (wantsOrderHistory(message)) {
    const restaurantQuery = message.match(/\bat\s+([a-z0-9 &'-]+)/i)?.[1] || "";
    return reply({ intent: "order_history", history: await mcp.execute("get_order_history", { restaurant_query: restaurantQuery, limit: 5 }, sessionId) });
  }
  if (/\b(download.*receipt|my receipts|get.*receipt|email.*receipt|receipt.*download)\b/i.test(message)) return reply({ intent: "receipts", receipts: await mcp.execute("get_receipts", { limit: 5 }, sessionId) });

  // 12. Smart AI sub-scenarios
  if (wantsSimilarPlace(message)) {
    const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
    return reply({ intent: "similar_place", restaurants });
  }
  if (wantsFriendMeal(message)) {
    const friendMatch = message.match(/(?:same as|like)\s+([A-Z][a-z]+)(?:'s)?/i);
    return reply({ intent: "friend_meal", friendName: friendMatch?.[1] || null });
  }
  if (wantsBehaviorRec(message)) {
    const items = await mcp.execute("get_personalized_recommendations", { restaurant_id: restaurantId, limit: 6 }, sessionId);
    session.lastMenuItems = items; sessions.set(sessionId, session);
    return reply({ intent: "behavior_rec", menuItems: items, personalized: true });
  }
  if (wantsMealSuggestion(message)) {
    const items = await mcp.execute("get_personalized_recommendations", { restaurant_id: restaurantId, limit: 6 }, sessionId);
    session.lastMenuItems = items; sessions.set(sessionId, session);
    return reply({ intent: "meal_suggestion", menuItems: items, personalized: true });
  }
  if (wantsGroupPlan(message)) {
    const budget = extractPriceCeiling(message);
    const groupSize = extractGroupSize(message);
    const items = await mcp.execute("search_menu", { q: "", limit: 20 }, sessionId);
    session.lastMenuItems = items; sessions.set(sessionId, session);
    return reply({ intent: "group_plan", budget, groupSize, menuItems: items });
  }

  // 13. Discovery pillar
  const pillar = reasonPillar(message);
  const isDiscoveryQuery = pillar === CAPABILITY_PILLARS.DISCOVERY || pillar === CAPABILITY_PILLARS.SMART_AI || wantsDiscovery(message) || extractPriceCeiling(message) > 0;
  if (isDiscoveryQuery && !wantsOrder(message)) {
    const { items, restaurants, discoveryMeta } = await buildDiscoveryContext(message, mcp, sessionId, restaurantId);
    session.lastMenuItems = items; sessions.set(sessionId, session);
    return reply({ intent: "discovery_answer", menuItems: items, restaurants, discoveryMeta });
  }

  // 14. Pure location / hours queries
  if (/\b(location|locations|address|phone|hours|where are you|find you|directions)\b/i.test(message)) {
    const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
    return reply({ intent: "locations", restaurants });
  }

  // 15. Ordering pillar — standard menu search
  const dayPart = detectDayPart(message);
  let serviceContext = null;
  if (wantsRecommendation(message) || !dayPart) {
    const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
    const restaurant = restaurants.find((r) => r.id === restaurantId) || restaurants[0];
    serviceContext = getServiceContext(restaurant, dayPart);
  }

  const menuQuery = extractMenuQuery(message) || dayPart || "burger";
  const isRec = wantsRecommendation(message);
  const searchDayPart = dayPart || (isRec ? serviceContext?.day_part : "");
  let menuItems = await mcp.execute("search_menu", { q: menuQuery, day_part: searchDayPart, restaurant_id: restaurantId, limit: 6 }, sessionId);
  let effectiveDayPart = searchDayPart;

  if (isRec && menuItems.length === 0 && !dayPart) {
    menuItems = await mcp.execute("search_menu", { q: menuQuery, day_part: "", restaurant_id: restaurantId, limit: 6 }, sessionId);
    effectiveDayPart = "";
    if (serviceContext) serviceContext.recommendation_note = `Best matches are based on lunch and dinner demand.`;
  }

  if (wantsOrder(message) && menuItems.length > 0) {
    const order = await mcp.execute("create_order_draft", {
      restaurant_id: restaurantId,
      items: [{ menuItemId: menuItems[0].id, quantity: 1 }],
      notes: `Drafted from chat: ${message}`
    }, sessionId);
    session.pendingOrder = order; session.lastMenuItems = menuItems; sessions.set(sessionId, session);
    return reply({ intent: "order_draft", order, matchedItem: menuItems[0], serviceContext });
  }

  if (session.pendingOrder) {
    session.lastMenuItems = menuItems; sessions.set(sessionId, session);
    return reply({ intent: "needs_order_confirmation", menuItems, dayPart: effectiveDayPart, serviceContext });
  }

  session.lastMenuItems = menuItems; sessions.set(sessionId, session);
  return reply({ intent: "menu_answer", menuItems, dayPart: effectiveDayPart, serviceContext });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeOrderItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    menuItemId: item.menuItemId || item.menu_item_id,
    quantity: item.quantity || 1,
    notes: item.notes || ""
  }));
}

function getServiceContext(restaurant, explicitDayPart = "") {
  const timeZone = restaurant?.timezone || "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true, weekday: "short" }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour24 = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const dayPart = explicitDayPart || inferDayPart(hour24);
  return {
    day_part: dayPart,
    display_day_part: dayPart,
    current_time: `${byType.weekday || ""} ${byType.hour}:${byType.minute} ${byType.dayPeriod || ""}`.trim(),
    restaurant_city: restaurant?.city || "restaurant",
    hours_label: formatHours(restaurant?.hours),
    timezone: timeZone
  };
}

function inferDayPart(hour) {
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 16) return "lunch";
  return "dinner";
}

function formatHours(hours = {}) {
  if (!hours.sun_thu && !hours.fri_sat) return "hours unavailable";
  return `Sun-Thu ${hours.sun_thu || "unavailable"}, Fri-Sat ${hours.fri_sat || "unavailable"}`;
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.normalize(path.join(publicDir, requested));
  if (!fullPath.startsWith(publicDir)) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const content = await fs.readFile(fullPath);
    res.writeHead(200, { "Content-Type": contentType(fullPath) });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function addCors(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || `http://${req.headers.host}`;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  if (status === 204) return res.end();
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("Invalid JSON body.");
    err.statusCode = 400;
    throw err;
  }
}

function cryptoSessionId() {
  return require("node:crypto").randomUUID();
}

if (require.main === module) main();

module.exports = vercelHandler;
module.exports.createRequestHandler = createRequestHandler;
module.exports.main = main;
