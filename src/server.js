const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createStore } = require("./db");
const { createMcpEngine } = require("./mcpEngine");
const {
  answerWithBrain,
  cancelsOrder,
  confirmsOrder,
  detectDayPart,
  extractSelectionNumber,
  extractMenuQuery,
  isSensitiveQuestion,
  wantsRecommendation,
  wantsOrder
} = require("./aiBrain");

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");
const sessions = new Map();

async function main() {
  const store = await createStore();
  const mcp = createMcpEngine(store);

  const server = http.createServer(async (req, res) => {
    try {
      addCors(req, res);
      if (req.method === "OPTIONS") return sendJson(res, 204, {});

      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true, mode: store.mode });
      }

      if (req.method === "GET" && url.pathname === "/mcp/tools") {
        return sendJson(res, 200, { tools: mcp.definitions });
      }

      if (req.method === "GET" && url.pathname === "/api/restaurants") {
        const restaurants = await mcp.execute("list_restaurants", {}, "api");
        return sendJson(res, 200, { restaurants });
      }

      if (req.method === "GET" && url.pathname === "/api/menu/search") {
        const menuItems = await mcp.execute(
          "search_menu",
          {
            q: url.searchParams.get("q") || "",
            day_part: url.searchParams.get("day_part") || "",
            restaurant_id: url.searchParams.get("restaurant_id") || "",
            limit: Number(url.searchParams.get("limit") || 8)
          },
          "api"
        );
        return sendJson(res, 200, { menuItems });
      }

      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = await readJson(req);
        const response = await handleChat({ body, mcp });
        return sendJson(res, 200, response);
      }

      if (req.method === "POST" && url.pathname === "/api/orders/draft") {
        const body = await readJson(req);
        const sessionId = body.sessionId || "api";
        const order = await mcp.execute(
          "create_order_draft",
          {
            restaurant_id: body.restaurantId,
            items: normalizeOrderItems(body.items),
            customer_name: body.customerName,
            customer_phone: body.customerPhone,
            notes: body.notes
          },
          sessionId
        );
        if (body.sessionId) {
          const session = sessions.get(body.sessionId) || { pendingOrder: null, lastMenuItems: [] };
          session.pendingOrder = order;
          sessions.set(body.sessionId, session);
        }
        return sendJson(res, 201, { order });
      }

      const confirmMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/confirm$/);
      if (req.method === "POST" && confirmMatch) {
        const order = await mcp.execute("confirm_order", { order_id: confirmMatch[1] }, "api");
        return sendJson(res, 200, { order });
      }

      const cancelMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
      if (req.method === "POST" && cancelMatch) {
        const order = await mcp.execute("cancel_order", { order_id: cancelMatch[1] }, "api");
        return sendJson(res, 200, { order });
      }

      const getOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (req.method === "GET" && getOrderMatch) {
        const order = await mcp.execute("get_order", { order_id: getOrderMatch[1] }, "api");
        return sendJson(res, order ? 200 : 404, { order });
      }

      if (req.method === "GET") {
        return serveStatic(req, res, url.pathname);
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      console.error(error);
      return sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`AI restaurant demo API listening on http://localhost:${PORT} (${store.mode})`);
  });
}

async function handleChat({ body, mcp }) {
  const sessionId = body.sessionId || cryptoSessionId();
  const session = sessions.get(sessionId) || { pendingOrder: null, lastMenuItems: [] };
  const message = String(body.message || "");
  const restaurantId = body.restaurantId || "";
  const dayPart = detectDayPart(message);
  let serviceContext = null;

  if (isSensitiveQuestion(message)) {
    const context = { intent: "blocked" };
    const reply = await answerWithBrain({ message, context, pendingOrder: session.pendingOrder });
    return { sessionId, reply, context };
  }

  if (session.pendingOrder && confirmsOrder(message)) {
    const order = await mcp.execute("confirm_order", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = null;
    sessions.set(sessionId, session);
    const context = { intent: "order_confirmed", order };
    const reply = await answerWithBrain({ message, context, pendingOrder: null });
    return { sessionId, reply, context };
  }

  if (session.pendingOrder && cancelsOrder(message)) {
    const order = await mcp.execute("cancel_order", { order_id: session.pendingOrder.id }, sessionId);
    session.pendingOrder = null;
    sessions.set(sessionId, session);
    const context = { intent: "order_cancelled", order };
    const reply = await answerWithBrain({ message, context, pendingOrder: null });
    return { sessionId, reply, context };
  }

  const selectionNumber = extractSelectionNumber(message);
  if (selectionNumber > 0 && session.lastMenuItems?.[selectionNumber - 1]) {
    const selectedItem = session.lastMenuItems[selectionNumber - 1];
    const order = await mcp.execute(
      "create_order_draft",
      {
        restaurant_id: restaurantId,
        items: [{ menuItemId: selectedItem.id, quantity: 1 }],
        notes: `Drafted from menu selection #${selectionNumber}: ${selectedItem.name}`
      },
      sessionId
    );
    session.pendingOrder = order;
    sessions.set(sessionId, session);
    const context = { intent: "order_draft", order, matchedItem: selectedItem };
    const reply = await answerWithBrain({ message, context, pendingOrder: order });
    return { sessionId, reply, context };
  }

  if (/\b(location|locations|address|phone|hours|open|where)\b/i.test(message)) {
    const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
    const context = { intent: "locations", restaurants };
    const reply = await answerWithBrain({ message, context, pendingOrder: session.pendingOrder });
    return { sessionId, reply, context };
  }

  if (wantsRecommendation(message) || !dayPart) {
    const restaurants = await mcp.execute("list_restaurants", {}, sessionId);
    const restaurant = restaurants.find((candidate) => candidate.id === restaurantId) || restaurants[0];
    serviceContext = getServiceContext(restaurant, dayPart);
  }

  const menuQuery = extractMenuQuery(message) || dayPart || "burger";
  const isRecommendation = wantsRecommendation(message);
  const searchDayPart = dayPart || (isRecommendation ? serviceContext?.day_part : "");
  let menuItems = await mcp.execute(
    "search_menu",
    {
      q: menuQuery,
      day_part: searchDayPart,
      restaurant_id: restaurantId,
      limit: 6
    },
    sessionId
  );
  let effectiveDayPart = searchDayPart;

  if (isRecommendation && menuItems.length === 0 && !dayPart) {
    menuItems = await mcp.execute(
      "search_menu",
      {
        q: menuQuery,
        day_part: "",
        restaurant_id: restaurantId,
        limit: 6
      },
      sessionId
    );
    effectiveDayPart = "";
    if (serviceContext) {
      serviceContext.display_day_part = "lunch/dinner";
      serviceContext.recommendation_note = `Best matches are based on lunch and dinner demand because no ${serviceContext.day_part} match is available right now.`;
    }
  }

  if (wantsOrder(message) && menuItems.length > 0) {
    const order = await mcp.execute(
      "create_order_draft",
      {
        restaurant_id: restaurantId,
        items: [{ menuItemId: menuItems[0].id, quantity: 1 }],
        notes: `Drafted from chat: ${message}`
      },
      sessionId
    );
    session.pendingOrder = order;
    session.lastMenuItems = menuItems;
    sessions.set(sessionId, session);
    const context = { intent: "order_draft", order, matchedItem: menuItems[0], serviceContext };
    const reply = await answerWithBrain({ message, context, pendingOrder: order });
    return { sessionId, reply, context };
  }

  if (session.pendingOrder) {
    session.lastMenuItems = menuItems;
    sessions.set(sessionId, session);
    const context = { intent: "needs_order_confirmation", menuItems, dayPart: effectiveDayPart, serviceContext };
    const reply = await answerWithBrain({ message, context, pendingOrder: session.pendingOrder });
    return { sessionId, reply, context };
  }

  session.lastMenuItems = menuItems;
  sessions.set(sessionId, session);
  const context = { intent: "menu_answer", menuItems, dayPart: effectiveDayPart, serviceContext };
  const reply = await answerWithBrain({ message, context, pendingOrder: null });
  return { sessionId, reply, context };
}

function normalizeOrderItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    menuItemId: item.menuItemId || item.menu_item_id,
    quantity: item.quantity || 1,
    notes: item.notes || ""
  }));
}

function getServiceContext(restaurant, explicitDayPart = "") {
  const timeZone = restaurant?.timezone || "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "short"
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour24 = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23"
    }).format(new Date())
  );
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
  return `Sun-Thu ${hours.sun_thu || "hours unavailable"}, Fri-Sat ${hours.fri_sat || "hours unavailable"}`;
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.normalize(path.join(publicDir, requested));

  if (!fullPath.startsWith(publicDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

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
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function cryptoSessionId() {
  return require("node:crypto").randomUUID();
}

if (require.main === module) {
  main();
}

module.exports = { main };
