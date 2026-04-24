function createRagEngine({ mcp }) {
  return {
    async retrievePillarContext({ pillar, query, sessionId, restaurantId, session, pendingOrder }) {
      const collection = collectionNameForPillar(pillar);
      const docs = await buildCollectionDocs({
        pillar,
        query,
        sessionId,
        restaurantId,
        session,
        pendingOrder,
        mcp
      });
      const ranked = rankDocs(query, docs).slice(0, 5);

      return {
        pillar,
        collection,
        snippets: ranked.map((doc) => ({
          id: doc.id,
          title: doc.title,
          source: doc.source,
          text: doc.text
        })),
        text: ranked.length > 0
          ? ranked.map((doc, index) => `[${index + 1}] ${doc.title}\n${doc.text}`).join("\n\n")
          : "No matching pillar-scoped context was found."
      };
    }
  };
}

async function buildCollectionDocs({ pillar, query, sessionId, restaurantId, session, pendingOrder, mcp }) {
  switch (pillar) {
    case "discovery":
      return buildDiscoveryDocs({ query, sessionId, restaurantId, mcp });
    case "ordering":
      return buildOrderingDocs({ query, sessionId, restaurantId, session, pendingOrder, mcp });
    case "payments":
      return buildPaymentsDocs({ query, sessionId, restaurantId, pendingOrder, mcp });
    case "rewards":
      return buildRewardsDocs({ query, sessionId, restaurantId, pendingOrder, mcp });
    case "smart_ai":
      return buildSmartAiDocs({ query, sessionId, restaurantId, session, mcp });
    default:
      return [];
  }
}

async function buildDiscoveryDocs({ query, sessionId, restaurantId, mcp }) {
  const docs = [
    {
      id: "discovery-rules",
      source: "policy",
      title: "Discovery rules",
      text: "Use nearby restaurants, open-now logic, hours, budget filters, dietary filters, and demand-aware ranking. Return only a few relevant options."
    }
  ];

  const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
  docs.push(...restaurants.slice(0, 10).map((restaurant) => ({
    id: `restaurant-${restaurant.id}`,
    source: "restaurant",
    title: `${restaurant.name} location`,
    text: `${restaurant.name} in ${restaurant.city}, ${restaurant.state}. Address: ${restaurant.address}. Phone: ${restaurant.phone || "unavailable"}. Hours Sun-Thu: ${restaurant.hours?.sun_thu || "unknown"}. Fri-Sat: ${restaurant.hours?.fri_sat || "unknown"}.`
  })));

  const menuQuery = normalizeQuery(query);
  const menuItems = await mcp.execute("search_menu", {
    q: menuQuery,
    restaurant_id: restaurantId,
    limit: 12
  }, sessionId);
  docs.push(...menuItems.map((item) => ({
    id: `menu-${item.id}`,
    source: "menu",
    title: item.name,
    text: `${item.name}. Category: ${item.category}. Price: $${Number(item.price).toFixed(2)}. Tags: ${(item.tags || []).join(", ") || "none"}. Description: ${item.description}. Demand score: ${item.demand_score || 0}.`
  })));

  return docs;
}

async function buildOrderingDocs({ query, sessionId, restaurantId, session, pendingOrder, mcp }) {
  const docs = [
    {
      id: "ordering-rules",
      source: "policy",
      title: "Ordering flow rules",
      text: "Ordering supports menu lookup, item customization, multi-item draft cart, add-to-order updates, draft-confirm-cancel flow, pickup, delivery notes, combo upgrades, and order status tracking."
    }
  ];

  if (pendingOrder) {
    docs.push({
      id: `pending-order-${pendingOrder.id}`,
      source: "session",
      title: "Pending order",
      text: formatOrderDoc(pendingOrder)
    });
  }

  if (session?.lastMenuItems?.length) {
    docs.push({
      id: "last-menu-items",
      source: "session",
      title: "Last shown menu items",
      text: session.lastMenuItems
        .slice(0, 6)
        .map((item, index) => `${index + 1}. ${item.name} - $${Number(item.price).toFixed(2)}.`)
        .join(" ")
    });
  }

  const menuItems = await mcp.execute("search_menu", {
    q: normalizeQuery(query),
    restaurant_id: restaurantId,
    limit: 8
  }, sessionId);
  docs.push(...menuItems.map((item) => ({
    id: `ordering-menu-${item.id}`,
    source: "menu",
    title: `Orderable item: ${item.name}`,
    text: `${item.name} costs $${Number(item.price).toFixed(2)}. Tags: ${(item.tags || []).join(", ") || "none"}. Description: ${item.description}.`
  })));

  return docs;
}

async function buildPaymentsDocs({ query, sessionId, restaurantId, pendingOrder, mcp }) {
  const rewards = await mcp.execute("get_rewards_summary", {}, sessionId);
  const transactions = await mcp.execute("get_transaction_history", { limit: 5 }, sessionId);
  const docs = [
    {
      id: "payments-rules",
      source: "policy",
      title: "Payment rules",
      text: "Payments support JhaPay wallet charging for orders, wallet recharge, split bill, QR pay, invoice pay, payment requests, and tip-and-close. Vendor payments remain blocked."
    },
    {
      id: "wallet-summary",
      source: "wallet",
      title: "Current wallet and rewards balance",
      text: `Wallet-linked points: ${rewards.points_balance}. Cashback balance: $${Number(rewards.cashback_balance || 0).toFixed(2)}.`
    }
  ];

  if (pendingOrder) {
    docs.push({
      id: `pending-payment-order-${pendingOrder.id}`,
      source: "session",
      title: "Pending order payment snapshot",
      text: `Pending order #${pendingOrder.display_order_id}. Subtotal: $${Number(pendingOrder.subtotal).toFixed(2)}. Final total: $${Number(pendingOrder.final_total || pendingOrder.subtotal).toFixed(2)}.`
    });
  }

  if (restaurantId) {
    const offers = await mcp.execute("get_cashback_offers", { restaurant_id: restaurantId }, sessionId);
    docs.push({
      id: "merchant-cashback-offers",
      source: "wallet",
      title: "Merchant cashback offers",
      text: `${offers.merchant} cashback offers: ${offers.offers.map((offer) => `${offer.title} at ${offer.rate_percent}%`).join("; ")}.`
    });
  }

  docs.push(...transactions.map((tx) => ({
    id: `tx-${tx.id}`,
    source: "transaction",
    title: `Recent transaction ${tx.type}`,
    text: `${tx.type} ${tx.direction === "credit" ? "credit" : "debit"} for $${Number(tx.amount).toFixed(2)} at ${tx.merchant}. Note: ${tx.note || "none"}.`
  })));

  return docs;
}

async function buildRewardsDocs({ sessionId, restaurantId, pendingOrder, mcp }) {
  const rewards = await mcp.execute("get_rewards_summary", {}, sessionId);
  const offers = await mcp.execute("get_cashback_offers", { restaurant_id: restaurantId }, sessionId);
  const docs = [
    {
      id: "rewards-rules",
      source: "policy",
      title: "Rewards rules",
      text: "Rewards can show points balance, coupons, cashback offers, milestone progress, and best discount application to a draft order."
    },
    {
      id: "rewards-summary",
      source: "rewards",
      title: "Current rewards summary",
      text: `Points: ${rewards.points_balance}. Cashback balance: $${Number(rewards.cashback_balance || 0).toFixed(2)}. Coupons: ${rewards.available_coupons?.map((coupon) => coupon.code).join(", ") || "none"}. Milestone remaining: ${rewards.milestone?.remaining_points || 0}.`
    },
    {
      id: "cashback-offers",
      source: "rewards",
      title: "Cashback offers",
      text: offers.offers.map((offer) => `${offer.title}: ${offer.rate_percent}% back. ${offer.note}`).join(" ")
    }
  ];

  if (pendingOrder) {
    docs.push({
      id: `rewards-pending-order-${pendingOrder.id}`,
      source: "session",
      title: "Draft order eligible for rewards",
      text: `Draft order #${pendingOrder.display_order_id}. Subtotal $${Number(pendingOrder.subtotal).toFixed(2)}. Current applied rewards: ${pendingOrder.rewards_applied ? JSON.stringify(pendingOrder.rewards_applied) : "none"}.`
    });
  }

  return docs;
}

async function buildSmartAiDocs({ sessionId, restaurantId, session, mcp }) {
  const docs = [
    {
      id: "smart-ai-rules",
      source: "policy",
      title: "Personalization rules",
      text: "Smart AI uses recent order history, favorites, demand, budget, and merchant similarity. Keep recommendations concise and explain why they fit."
    }
  ];

  const recommendations = await mcp.execute("get_personalized_recommendations", {
    restaurant_id: restaurantId,
    limit: 6
  }, sessionId);
  docs.push(...recommendations.map((item) => ({
    id: `personalized-${item.id}`,
    source: "recommendation",
    title: `Personalized item: ${item.name}`,
    text: `${item.name} at $${Number(item.price).toFixed(2)}. ${item.recommendation_reason || "Recommended from history and demand."} Demand score ${item.demand_score || 0}.`
  })));

  const history = await mcp.execute("get_order_history", { limit: 5 }, sessionId);
  if (history.orders?.length) {
    docs.push({
      id: "recent-order-history",
      source: "history",
      title: "Recent order history",
      text: history.orders
        .map((order) => `Order #${order.display_order_id} from ${order.restaurant?.city || order.restaurant?.name}: ${order.items.map((item) => `${item.quantity} x ${item.item_name}`).join(", ")}.`)
        .join(" ")
    });
  }

  if (session?.lastMenuItems?.length) {
    docs.push({
      id: "last-ranked-items",
      source: "session",
      title: "Recently ranked items",
      text: session.lastMenuItems
        .slice(0, 6)
        .map((item) => `${item.name} with demand ${item.demand_score || 0}.`)
        .join(" ")
    });
  }

  return docs;
}

function collectionNameForPillar(pillar) {
  switch (pillar) {
    case "discovery":
      return "discovery_docs";
    case "ordering":
      return "ordering_docs";
    case "payments":
      return "payments_docs";
    case "rewards":
      return "rewards_docs";
    case "smart_ai":
      return "smart_ai_docs";
    default:
      return "general_docs";
  }
}

function rankDocs(query, docs) {
  const queryTokens = tokenize(query);
  return docs
    .map((doc) => ({
      ...doc,
      score: scoreDoc(doc, query, queryTokens)
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((doc, index) => doc.score > 0 || index < 3);
}

function scoreDoc(doc, query, queryTokens) {
  const haystack = `${doc.title} ${doc.text}`.toLowerCase();
  const phrase = String(query || "").trim().toLowerCase();
  let score = doc.source === "session" ? 4 : doc.source === "policy" ? 2 : 0;
  if (phrase && haystack.includes(phrase)) score += 8;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 3;
  }
  return score;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function normalizeQuery(query) {
  const cleaned = String(query || "").trim();
  return cleaned.length > 1 ? cleaned : "";
}

function formatOrderDoc(order) {
  return `Order #${order.display_order_id}. Status: ${order.status}. Items: ${(order.items || []).map((item) => `${item.quantity} x ${item.item_name}`).join(", ")}. Subtotal: $${Number(order.subtotal).toFixed(2)}. Final total: $${Number(order.final_total || order.subtotal).toFixed(2)}.`;
}

module.exports = { createRagEngine, collectionNameForPillar };
