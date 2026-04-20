const SENSITIVE_TOPICS = [
  "sale",
  "sales",
  "revenue",
  "profit",
  "payroll",
  "salary",
  "employee",
  "bank",
  "units sold",
  "how many sold",
  "how many are you selling",
  "inventory",
  "stock",
  "token",
  "credit card",
  "payment token",
  "ssn",
  "vendor",
  "contract",
  "private",
  "admin"
];

async function answerWithBrain({ message, context, pendingOrder }) {
  if (process.env.OPENAI_API_KEY) {
    const aiAnswer = await callOpenAiCompatibleApi({ message, context, pendingOrder });
    if (aiAnswer) return aiAnswer;
  }

  return localAnswer({ message, context, pendingOrder });
}

function isSensitiveQuestion(message) {
  const text = String(message || "").toLowerCase();
  const mentionsPrivateTopic = SENSITIVE_TOPICS.some((topic) => text.includes(topic));
  const asksBusinessCount = /\b(how many|count|number of|total)\b.*\b(sell|selling|sold|orders?|ordered|stock|inventory)\b/.test(text);
  return mentionsPrivateTopic || asksBusinessCount;
}

function detectDayPart(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("breakfast") || text.includes("morning")) return "breakfast";
  if (text.includes("lunch") || text.includes("noon")) return "lunch";
  if (text.includes("dinner") || text.includes("evening") || text.includes("night")) return "dinner";
  return "";
}

function wantsOrder(message) {
  const text = String(message || "").toLowerCase();
  return /\b(order|buy|get me|add|i want|place)\b/.test(text);
}

function wantsRecommendation(message) {
  const text = String(message || "").toLowerCase();
  return /\b(best|popular|highly ordered|most ordered|demand|recommended|recommend|favorite|favourite)\b/.test(text);
}

function extractSelectionNumber(message) {
  const text = String(message || "").toLowerCase().trim();
  const match = text.match(/^(?:order|select|choose|pick|add|get)?\s*#?\s*(\d{1,2})\b/);
  if (!match) return 0;
  return Number(match[1]);
}

function confirmsOrder(message) {
  const text = String(message || "").toLowerCase().trim();
  return /\b(confirm|yes|yeah|yep|place it|go ahead|sounds good)\b/.test(text);
}

function cancelsOrder(message) {
  const text = String(message || "").toLowerCase().trim();
  return /\b(cancel|never mind|nevermind|remove|stop|no thanks|don't order|do not order)\b/.test(text);
}

function extractMenuQuery(message) {
  return String(message || "")
    .replace(/\b(can|you|please|i|want|would|like|to|order|buy|get|me|add|for|a|an|the|what|whats|what's|which|there|in|on|menu|today|have|do|best|popular|highly|ordered|most|demand|recommended|recommend|favorite|favourite)\b/gi, " ")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localAnswer({ context, pendingOrder }) {
  if (context.intent === "blocked") {
    return "Sorry, I cannot help with sales counts or private business data. I can help you with the menu, locations, hours, or placing an order.";
  }

  if (context.intent === "locations") {
    const locations = context.restaurants.slice(0, 10).map((restaurant) => {
      const demoLabel = restaurant.is_demo ? " demo" : "";
      return `${restaurant.name}${demoLabel}: ${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.postal_code}, ${restaurant.phone || "phone unavailable"}`;
    });
    return `Here are the available restaurants:\n${locations.join("\n")}`;
  }

  if (context.intent === "order_confirmed") {
    return `${formatOrder(context.order, "Your order is confirmed.")}\nEstimated pickup time: ${context.order.estimated_pickup_minutes || 18} minutes.\nEnjoy your food.`;
  }

  if (context.intent === "order_cancelled") {
    return "No problem, I cancelled that draft order. Nothing was placed.";
  }

  if (context.intent === "order_draft") {
    return `${formatOrder(context.order, "I drafted this order.")}\nPlease say "confirm" if you want me to place it.`;
  }

  if (context.intent === "needs_order_confirmation" && pendingOrder) {
    return `${formatOrder(pendingOrder, "I still have this draft order ready.")}\nSay "confirm" and I will place it.`;
  }

  if (context.menuItems && context.menuItems.length > 0) {
    return `Here are good choices:\n\nReply with a number like "1" or say "order 2" and I can draft it for confirmation.`;
  }

  return "I can help with the menu, lunch ideas, restaurant locations, hours, and draft orders. Try asking: \"what is good for lunch?\"";
}

function formatOrder(order, heading) {
  const lines = order.items.map((item) => `- ${item.quantity} x ${item.item_name} - $${(item.unit_price * item.quantity).toFixed(2)}`);
  const walletLine = order.jhapay_wallet
    ? `JhaPay remaining after this order: $${Number(order.jhapay_wallet.remaining_after).toFixed(2)}`
    : "";
  return `${heading}\nOrder #${order.display_order_id}\n${lines.join("\n")}\nSubtotal: $${Number(order.subtotal).toFixed(2)}\nPickup: ${order.pickup_location || `${order.restaurant.name}, ${order.restaurant.city}`}\n${walletLine}`;
}

async function callOpenAiCompatibleApi({ message, context, pendingOrder }) {
  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a fast restaurant ordering assistant. Answer only from provided tool context. Refuse sales, payroll, payment token, private, admin, or back-office questions. Never claim an order is placed unless context.intent is order_confirmed."
          },
          {
            role: "user",
            content: JSON.stringify({
              user_message: message,
              allowed_context: context,
              pending_order: pendingOrder || null
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

module.exports = {
  answerWithBrain,
  cancelsOrder,
  confirmsOrder,
  detectDayPart,
  extractSelectionNumber,
  extractMenuQuery,
  isSensitiveQuestion,
  wantsRecommendation,
  wantsOrder
};
