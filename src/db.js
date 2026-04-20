const crypto = require("node:crypto");
const { restaurants, menuItems } = require("./demoData");

async function createStore() {
  if (!process.env.DATABASE_URL) {
    return new MemoryStore();
  }

  try {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("select 1");
    return new PostgresStore(pool);
  } catch (error) {
    console.warn(`[db] Falling back to in-memory demo store: ${error.message}`);
    return new MemoryStore();
  }
}

class MemoryStore {
  constructor() {
    this.mode = "memory";
    this.restaurants = restaurants;
    this.menuItems = menuItems;
    this.orders = new Map();
    this.auditLog = [];
  }

  async listRestaurants() {
    return this.restaurants;
  }

  async searchMenu({ q = "", dayPart, restaurantId, limit = 8 } = {}) {
    const cleanQuery = String(q || "").trim().toLowerCase();
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    const normalizedDayPart = normalizeDayPart(dayPart);

    const results = this.menuItems
      .filter((menuItem) => menuItem.is_available)
      .filter((menuItem) => {
        if (!normalizedDayPart) return true;
        return menuItem.availability.includes(normalizedDayPart) || menuItem.availability.includes("all_day");
      })
      .filter((menuItem) => {
        if (!restaurantId) return true;
        return this.restaurants.some((restaurant) => restaurant.id === restaurantId);
      })
      .map((menuItem) => {
        const textScore = scoreMenuItem(menuItem, tokens);
        const itemDemandScore = demandScore(menuItem, normalizedDayPart);
        return {
          ...menuItem,
          text_score: textScore,
          demand_score: itemDemandScore,
          is_highly_demanded: itemDemandScore >= 85,
          score: textScore + itemDemandScore / 100
        };
      })
      .filter((menuItem) => tokens.length === 0 || menuItem.text_score > 0)
      .sort((a, b) => b.score - a.score || b.demand_score - a.demand_score || a.price - b.price)
      .slice(0, Number(limit) || 8);

    return results.map(stripScore);
  }

  async createOrderDraft({ restaurantId, items, customerName = "", customerPhone = "", notes = "" }) {
    const restaurant = this.restaurants.find((candidate) => candidate.id === restaurantId) || this.restaurants[0];
    const orderItems = [];

    for (const requestedItem of aggregateRequestedItems(items)) {
      const menuItem = this.menuItems.find((candidate) => candidate.id === requestedItem.menuItemId);
      if (!menuItem) continue;
      const quantity = clampQuantity(requestedItem.quantity);
      orderItems.push({
        id: crypto.randomUUID(),
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        unit_price: menuItem.price,
        quantity,
        notes: requestedItem.notes || ""
      });
    }

    if (orderItems.length === 0) {
      throw new Error("No valid menu items were provided for the order.");
    }

    const subtotal = money(orderItems.reduce((sum, orderItem) => sum + orderItem.unit_price * orderItem.quantity, 0));
    const orderId = crypto.randomUUID();
    const order = {
      id: orderId,
      display_order_id: makeDisplayOrderId(orderId),
      restaurant_id: restaurant.id,
      restaurant,
      customer_name: customerName,
      customer_phone: customerPhone,
      status: "draft",
      subtotal,
      notes,
      items: orderItems,
      created_at: new Date().toISOString(),
      confirmed_at: null
    };

    this.orders.set(order.id, order);
    return withWallet(order);
  }

  async confirmOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error("Order not found.");
    }
    order.status = "confirmed";
    order.confirmed_at = new Date().toISOString();
    this.orders.set(order.id, order);
    return withWallet(order);
  }

  async cancelOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error("Order not found.");
    }
    order.status = "cancelled";
    this.orders.set(order.id, order);
    return withWallet(order);
  }

  async getOrder(orderId) {
    const order = this.orders.get(orderId);
    return order ? withWallet(order) : null;
  }

  async auditTool(sessionId, toolName, input) {
    this.auditLog.push({ sessionId, toolName, input, createdAt: new Date().toISOString() });
  }
}

class PostgresStore {
  constructor(pool) {
    this.mode = "postgres";
    this.pool = pool;
  }

  async listRestaurants() {
    const { rows } = await this.pool.query(
      `select id, name, address, city, state, postal_code, phone, is_demo, image_url, hours
       from ai.restaurants
       order by is_demo asc, name asc`
    );
    return rows;
  }

  async searchMenu({ q = "", dayPart, restaurantId, limit = 8 } = {}) {
    const where = ["m.is_available = true"];
    const values = [];
    const normalizedDayPart = normalizeDayPart(dayPart);
    let dayPartPosition = 0;

    if (restaurantId) {
      values.push(restaurantId);
      where.push(`exists (
        select 1 from ai.restaurant_menu_items rmi
        where rmi.menu_item_id = m.id and rmi.restaurant_id = $${values.length}
      )`);
    }

    if (normalizedDayPart) {
      values.push(normalizedDayPart);
      dayPartPosition = values.length;
      where.push(`exists (
        select 1 from ai.item_availability ia
        where ia.menu_item_id = m.id and ia.day_part in ($${values.length}, 'all_day')
      )`);
    }

    const cleanQuery = String(q || "").trim();
    let rankExpression = "0";
    const demandExpression = dayPartPosition
      ? `coalesce((m.demand ->> $${dayPartPosition})::int, 0)`
      : `greatest(coalesce((m.demand ->> 'breakfast')::int, 0), coalesce((m.demand ->> 'lunch')::int, 0), coalesce((m.demand ->> 'dinner')::int, 0))`;
    if (cleanQuery) {
      values.push(cleanQuery);
      const queryPosition = values.length;
      where.push(`m.search_vector @@ websearch_to_tsquery('english', $${queryPosition})`);
      rankExpression = `ts_rank_cd(m.search_vector, websearch_to_tsquery('english', $${queryPosition}))`;
    }

    values.push(Math.min(Number(limit) || 8, 20));
    const limitPosition = values.length;

    const { rows } = await this.pool.query(
      `select
          m.id,
          m.name,
          m.description,
          m.price::float as price,
          m.tags,
          m.allergens,
          m.image_url,
          m.demand,
          c.name as category,
          coalesce(array_agg(distinct ia.day_part) filter (where ia.day_part is not null), '{}') as availability,
          ${demandExpression} as demand_score,
          (${rankExpression} + (${demandExpression} / 100.0)) as score
       from ai.menu_items m
       join ai.menu_categories c on c.id = m.category_id
       left join ai.item_availability ia on ia.menu_item_id = m.id
       where ${where.join(" and ")}
       group by m.id, c.name
       order by score desc, demand_score desc, m.price asc
       limit $${limitPosition}`,
      values
    );

    return rows.map((row) => ({
      ...stripScore(row),
      is_highly_demanded: Number(row.demand_score || 0) >= 85
    }));
  }

  async createOrderDraft({ restaurantId, items, customerName = "", customerPhone = "", notes = "" }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const restaurant = await this.selectRestaurant(client, restaurantId);
      const requestedItems = aggregateRequestedItems(items);
      const menuIds = requestedItems.map((requestedItem) => requestedItem.menuItemId).filter(Boolean);

      if (menuIds.length === 0) {
        throw new Error("No menu items were provided for the order.");
      }

      const { rows: menuRows } = await client.query(
        `select id, name, price::float as price
         from ai.menu_items
         where id = any($1::uuid[]) and is_available = true`,
        [menuIds]
      );

      const menuById = new Map(menuRows.map((row) => [row.id, row]));
      const orderItems = [];

      for (const requestedItem of requestedItems) {
        const menuItem = menuById.get(requestedItem.menuItemId);
        if (!menuItem) continue;
        orderItems.push({
          menu_item_id: menuItem.id,
          item_name: menuItem.name,
          unit_price: menuItem.price,
          quantity: clampQuantity(requestedItem.quantity),
          notes: requestedItem.notes || ""
        });
      }

      if (orderItems.length === 0) {
        throw new Error("No valid menu items were provided for the order.");
      }

      const subtotal = money(orderItems.reduce((sum, orderItem) => sum + orderItem.unit_price * orderItem.quantity, 0));
      const { rows: orderRows } = await client.query(
        `insert into ai.orders (restaurant_id, customer_name, customer_phone, subtotal, notes)
         values ($1, $2, $3, $4, $5)
         returning id, restaurant_id, customer_name, customer_phone, status, subtotal::float as subtotal, notes, created_at, confirmed_at`,
        [restaurant.id, customerName, customerPhone, subtotal, notes]
      );

      const order = orderRows[0];
      const insertedItems = [];
      for (const orderItem of orderItems) {
        const { rows } = await client.query(
          `insert into ai.order_items (order_id, menu_item_id, quantity, item_name, unit_price, notes)
           values ($1, $2, $3, $4, $5, $6)
           returning id, menu_item_id, quantity, item_name, unit_price::float as unit_price, notes`,
          [order.id, orderItem.menu_item_id, orderItem.quantity, orderItem.item_name, orderItem.unit_price, orderItem.notes]
        );
        insertedItems.push(rows[0]);
      }

      await client.query("commit");
      return withWallet({ ...order, display_order_id: makeDisplayOrderId(order.id), restaurant, items: insertedItems });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmOrder(orderId) {
    const { rows } = await this.pool.query(
      `update ai.orders
       set status = 'confirmed', confirmed_at = now()
       where id = $1 and status = 'draft'
       returning id`,
      [orderId]
    );

    if (rows.length === 0) {
      throw new Error("Order not found or already confirmed.");
    }

    return this.getOrder(orderId);
  }

  async cancelOrder(orderId) {
    const { rows } = await this.pool.query(
      `update ai.orders
       set status = 'cancelled'
       where id = $1 and status = 'draft'
       returning id`,
      [orderId]
    );

    if (rows.length === 0) {
      throw new Error("Order not found or cannot be cancelled.");
    }

    return this.getOrder(orderId);
  }

  async getOrder(orderId) {
    const { rows: orderRows } = await this.pool.query(
      `select id, restaurant_id, customer_name, customer_phone, status, subtotal::float as subtotal, notes, created_at, confirmed_at
       from ai.orders
       where id = $1`,
      [orderId]
    );

    if (orderRows.length === 0) return null;

    const order = orderRows[0];
    const { rows: restaurantRows } = await this.pool.query(
      `select id, name, address, city, state, postal_code, phone, is_demo, image_url, hours
       from ai.restaurants
       where id = $1`,
      [order.restaurant_id]
    );
    const { rows: orderItems } = await this.pool.query(
      `select id, menu_item_id, quantity, item_name, unit_price::float as unit_price, notes
       from ai.order_items
       where order_id = $1
       order by id`,
      [orderId]
    );

    return withWallet({ ...order, display_order_id: makeDisplayOrderId(order.id), restaurant: restaurantRows[0] || null, items: orderItems });
  }

  async auditTool(sessionId, toolName, input) {
    await this.pool.query(
      `insert into ai.tool_audit_log (session_id, tool_name, input)
       values ($1, $2, $3)`,
      [sessionId, toolName, input || {}]
    );
  }

  async selectRestaurant(client, restaurantId) {
    if (restaurantId) {
      const { rows } = await client.query(
        `select id, name, address, city, state, postal_code, phone, is_demo, image_url, hours
         from ai.restaurants
         where id = $1`,
        [restaurantId]
      );
      if (rows[0]) return rows[0];
    }

    const { rows } = await client.query(
      `select id, name, address, city, state, postal_code, phone, is_demo, image_url, hours
       from ai.restaurants
       order by is_demo asc, name asc
       limit 1`
    );
    return rows[0];
  }
}

function normalizeDayPart(dayPart) {
  const value = String(dayPart || "").toLowerCase();
  if (["breakfast", "lunch", "dinner"].includes(value)) return value;
  return "";
}

function scoreMenuItem(menuItem, tokens) {
  if (tokens.length === 0) return 1;
  const haystack = [menuItem.name, menuItem.description, menuItem.category, ...menuItem.tags].join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function demandScore(menuItem, dayPart) {
  const demand = menuItem.demand || {};
  if (dayPart && Number.isFinite(Number(demand[dayPart]))) {
    return Number(demand[dayPart]);
  }
  return Math.max(0, ...Object.values(demand).map((value) => Number(value) || 0));
}

function stripScore(menuItem) {
  const { score, text_score, ...safeMenuItem } = menuItem;
  return safeMenuItem;
}

function aggregateRequestedItems(items) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const menuItemId = item.menuItemId || item.menu_item_id;
    if (!menuItemId) continue;
    const existing = byId.get(menuItemId) || { menuItemId, quantity: 0, notes: "" };
    existing.quantity += clampQuantity(item.quantity);
    existing.notes = item.notes || existing.notes;
    byId.set(menuItemId, existing);
  }
  return [...byId.values()].map((item) => ({
    ...item,
    quantity: Math.min(item.quantity, 20)
  }));
}

function clampQuantity(quantity) {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(Math.trunc(parsed), 20));
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function withWallet(order) {
  const balanceBefore = 50;
  const orderTotal = Number(order.subtotal || 0);
  const remainingAfter = money(balanceBefore - orderTotal);
  return {
    ...order,
    display_order_id: order.display_order_id || makeDisplayOrderId(order.id),
    pickup_location: formatPickupLocation(order.restaurant),
    jhapay_wallet: {
      currency: "USD",
      balance_before: balanceBefore,
      order_total: money(orderTotal),
      remaining_after: remainingAfter,
      has_enough_balance: remainingAfter >= 0
    },
    estimated_pickup_minutes: estimatePickupMinutes(order.items)
  };
}

function makeDisplayOrderId(seed = crypto.randomUUID()) {
  const hex = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 8);
  return String(parseInt(hex, 16) % 1000000).padStart(6, "0");
}

function formatPickupLocation(restaurant) {
  if (!restaurant) return "";
  return `${restaurant.name}, ${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.postal_code}`;
}

function estimatePickupMinutes(items) {
  const itemCount = (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return Math.min(35, 12 + itemCount * 3);
}

module.exports = { createStore };
