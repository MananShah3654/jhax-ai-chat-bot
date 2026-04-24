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
    this.profiles = new Map();
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

  async createOrderDraft({ restaurantId, items, customerName = "", customerPhone = "", notes = "" }, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
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
    return withWallet(order, profile);
  }

  async confirmOrder(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error("Order not found.");
    }
    const meta = getOrderMeta(profile, order.id);
    const chargeTotal = calculateChargeTotal(order, meta);
    if (profile.walletBalance < chargeTotal) {
      throw new Error(`Not enough JhaPay wallet balance. Recharge $${money(chargeTotal - profile.walletBalance).toFixed(2)} and try again.`);
    }

    profile.walletBalance = money(profile.walletBalance - chargeTotal);
    const pointsRedeemed = Number(meta?.rewards_applied?.points_used || 0);
    const pointsEarned = estimatePointsEarned(chargeTotal);
    const cashbackEarned = estimateCashbackEarned(order, chargeTotal);

    profile.pointsBalance = Math.max(0, profile.pointsBalance - pointsRedeemed) + pointsEarned;
    profile.lifetimePoints += pointsEarned;
    profile.cashbackBalance = money(profile.cashbackBalance + cashbackEarned);
    if (meta?.rewards_applied?.coupon_code) {
      profile.coupons = profile.coupons.filter((coupon) => coupon.code !== meta.rewards_applied.coupon_code);
    }

    setOrderMeta(profile, order.id, {
      wallet_balance_before_charge: meta?.wallet_balance_before_charge ?? money(profile.walletBalance + chargeTotal),
      wallet_balance_after_charge: profile.walletBalance,
      charged_total: chargeTotal,
      points_earned: pointsEarned,
      cashback_earned: cashbackEarned,
      receipt_id: meta?.receipt_id || makeReceiptId(order.id)
    });

    order.status = "confirmed";
    order.confirmed_at = new Date().toISOString();
    this.orders.set(order.id, order);
    recordConfirmedOrder(profile, withWallet(order, profile));
    recordTransaction(profile, {
      type: "order_payment",
      amount: chargeTotal,
      direction: "debit",
      merchant: order.restaurant?.name || "Olympic Flame Burgers",
      note: `Order #${order.display_order_id || makeDisplayOrderId(order.id)}`,
      related_order_id: order.id
    });
    return withWallet(order, profile);
  }

  async cancelOrder(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error("Order not found.");
    }
    order.status = "cancelled";
    this.orders.set(order.id, order);
    return withWallet(order, profile);
  }

  async getOrder(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = this.orders.get(orderId);
    return order ? withWallet(order, profile) : null;
  }

  async getRewardsSummary(sessionId = "anonymous") {
    return buildRewardsSummary(ensureProfile(this, sessionId));
  }

  async getCashbackOffers({ restaurantId } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const restaurant = this.restaurants.find((candidate) => candidate.id === restaurantId) || this.restaurants[0];
    return {
      merchant: restaurant?.name || "Olympic Flame Burgers",
      cashback_balance: profile.cashbackBalance,
      offers: [
        { title: "Burger combos", rate_percent: 8, note: "Applies to any combo purchase today." },
        { title: "Street tacos", rate_percent: 6, note: "Lunch and dinner taco orders qualify." },
        { title: "Breakfast favorites", rate_percent: 5, note: "Earn extra cashback before 11am." }
      ]
    };
  }

  async applyBestRewards(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = this.orders.get(orderId);
    if (!order) throw new Error("Order not found.");
    if (order.status !== "draft") throw new Error("Rewards can only be applied to a draft order.");

    const rewardsApplied = chooseBestRewardApplication(order, profile);
    const discountTotal = money(
      Number(rewardsApplied.coupon_discount || 0) +
      Number(rewardsApplied.points_discount || 0)
    );
    setOrderMeta(profile, orderId, {
      discount_total: discountTotal,
      charged_total: money(Math.max(0, Number(order.subtotal || 0) - discountTotal)),
      rewards_applied: rewardsApplied
    });
    return withWallet(order, profile);
  }

  async getTransactionHistory({ limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return [...profile.transactions]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, Math.max(1, Number(limit) || 5));
  }

  async getSpendInsights({ days = 7 } = {}, sessionId = "anonymous") {
    return buildSpendInsights(ensureProfile(this, sessionId), days);
  }

  async getOrderHistory({ restaurantQuery = "", limit = 5 } = {}, sessionId = "anonymous") {
    return buildOrderHistory(ensureProfile(this, sessionId), { restaurantQuery, limit });
  }

  async reorderLastOrder({ restaurantId = "", useUsual = false } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const orderTemplate = findReorderTemplate(profile, { restaurantId, useUsual });
    if (!orderTemplate) return null;
    return this.createOrderDraft({
      restaurantId: orderTemplate.restaurant_id,
      items: orderTemplate.items.map((item) => ({
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        notes: item.notes
      })),
      notes: useUsual ? "Drafted from your usual order." : "Drafted from your order history."
    }, sessionId);
  }

  async saveDealAlert({ query = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const normalized = String(query || "burger deals").trim() || "burger deals";
    if (!profile.dealAlerts.includes(normalized)) profile.dealAlerts.push(normalized);
    return { saved: normalized, alerts: [...profile.dealAlerts] };
  }

  async splitBill({ amount = 0, people = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return buildSplitBill({ amount, people, walletBalance: profile.walletBalance });
  }

  async rechargeWallet({ amount = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 25);
    profile.walletBalance = money(profile.walletBalance + value);
    const tx = recordTransaction(profile, {
      type: "wallet_top_up",
      amount: value,
      direction: "credit",
      merchant: "JhaPay wallet",
      note: "Wallet recharge completed"
    });
    return { amount: value, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async createQrPayment({ amount = 0, merchant = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 18.75);
    if (profile.walletBalance < value) {
      throw new Error(`Not enough JhaPay wallet balance for QR payment. Recharge $${money(value - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - value);
    const tx = recordTransaction(profile, {
      type: "qr_payment",
      amount: value,
      direction: "debit",
      merchant: merchant || "QR merchant",
      note: "QR payment completed"
    });
    return { amount: value, merchant: tx.merchant, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async requestPayment({ amount = 0, recipient = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 24);
    const request = {
      id: crypto.randomUUID(),
      amount: value,
      recipient: recipient || "your friend",
      status: "sent",
      created_at: new Date().toISOString()
    };
    profile.paymentRequests.unshift(request);
    return request;
  }

  async payInvoice({ amount = 0, merchant = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 42.5);
    if (profile.walletBalance < value) {
      throw new Error(`Not enough JhaPay wallet balance to pay this invoice. Recharge $${money(value - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - value);
    const tx = recordTransaction(profile, {
      type: "invoice_payment",
      amount: value,
      direction: "debit",
      merchant: merchant || "Invoice merchant",
      note: "Invoice paid"
    });
    return { amount: value, merchant: tx.merchant, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async tipAndClose({ amount = 0, tipPercent = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const baseAmount = sanitizeMoneyAmount(amount, 36);
    const safeTipPercent = Math.max(0, Math.min(Number(tipPercent) || 18, 40));
    const tipAmount = money(baseAmount * safeTipPercent / 100);
    const total = money(baseAmount + tipAmount);
    if (profile.walletBalance < total) {
      throw new Error(`Not enough JhaPay wallet balance to close this check. Recharge $${money(total - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - total);
    const tx = recordTransaction(profile, {
      type: "tip_close",
      amount: total,
      direction: "debit",
      merchant: "Restaurant check",
      note: `Check closed with ${safeTipPercent}% tip`
    });
    return { base_amount: baseAmount, tip_percent: safeTipPercent, tip_amount: tipAmount, total, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async getReceipts({ limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return [...profile.confirmedOrders]
      .slice()
      .reverse()
      .slice(0, Math.max(1, Number(limit) || 5))
      .map((order) => ({
        receipt_id: order.receipt_id || makeReceiptId(order.id),
        order_id: order.id,
        display_order_id: order.display_order_id,
        merchant: order.restaurant?.name || "Olympic Flame Burgers",
        total: Number(order.payment_summary?.charged_total || order.subtotal || 0),
        created_at: order.confirmed_at || order.created_at
      }));
  }

  async getPersonalizedRecommendations({ restaurantId = "", limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const candidates = await this.searchMenu({ q: "", restaurantId, limit: 20 });
    return personalizeMenuItems(candidates, profile).slice(0, Math.max(1, Number(limit) || 5));
  }

  async auditTool(sessionId, toolName, input) {
    this.auditLog.push({ sessionId, toolName, input, createdAt: new Date().toISOString() });
  }
}

class PostgresStore {
  constructor(pool) {
    this.mode = "postgres";
    this.pool = pool;
    this.profiles = new Map();
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

  async createOrderDraft({ restaurantId, items, customerName = "", customerPhone = "", notes = "" }, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
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
      return withWallet({ ...order, display_order_id: makeDisplayOrderId(order.id), restaurant, items: insertedItems }, profile);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmOrder(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = await this.getOrder(orderId, sessionId);
    if (!order) throw new Error("Order not found or already confirmed.");
    const meta = getOrderMeta(profile, order.id);
    const chargeTotal = calculateChargeTotal(order, meta);
    if (profile.walletBalance < chargeTotal) {
      throw new Error(`Not enough JhaPay wallet balance. Recharge $${money(chargeTotal - profile.walletBalance).toFixed(2)} and try again.`);
    }

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

    profile.walletBalance = money(profile.walletBalance - chargeTotal);
    const pointsRedeemed = Number(meta?.rewards_applied?.points_used || 0);
    const pointsEarned = estimatePointsEarned(chargeTotal);
    const cashbackEarned = estimateCashbackEarned(order, chargeTotal);
    profile.pointsBalance = Math.max(0, profile.pointsBalance - pointsRedeemed) + pointsEarned;
    profile.lifetimePoints += pointsEarned;
    profile.cashbackBalance = money(profile.cashbackBalance + cashbackEarned);
    if (meta?.rewards_applied?.coupon_code) {
      profile.coupons = profile.coupons.filter((coupon) => coupon.code !== meta.rewards_applied.coupon_code);
    }

    setOrderMeta(profile, order.id, {
      wallet_balance_before_charge: meta?.wallet_balance_before_charge ?? money(profile.walletBalance + chargeTotal),
      wallet_balance_after_charge: profile.walletBalance,
      charged_total: chargeTotal,
      points_earned: pointsEarned,
      cashback_earned: cashbackEarned,
      receipt_id: meta?.receipt_id || makeReceiptId(order.id)
    });

    const confirmed = await this.getOrder(orderId, sessionId);
    recordConfirmedOrder(profile, confirmed);
    recordTransaction(profile, {
      type: "order_payment",
      amount: chargeTotal,
      direction: "debit",
      merchant: confirmed.restaurant?.name || "Olympic Flame Burgers",
      note: `Order #${confirmed.display_order_id}`,
      related_order_id: confirmed.id
    });
    return confirmed;
  }

  async cancelOrder(orderId, sessionId = "anonymous") {
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

    return this.getOrder(orderId, sessionId);
  }

  async getOrder(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
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

    return withWallet({ ...order, display_order_id: makeDisplayOrderId(order.id), restaurant: restaurantRows[0] || null, items: orderItems }, profile);
  }

  async getRewardsSummary(sessionId = "anonymous") {
    return buildRewardsSummary(ensureProfile(this, sessionId));
  }

  async getCashbackOffers({ restaurantId } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const restaurant = await this.selectRestaurant(this.pool, restaurantId).catch(() => null);
    return {
      merchant: restaurant?.name || "Olympic Flame Burgers",
      cashback_balance: profile.cashbackBalance,
      offers: [
        { title: "Burger combos", rate_percent: 8, note: "Applies to any combo purchase today." },
        { title: "Street tacos", rate_percent: 6, note: "Lunch and dinner taco orders qualify." },
        { title: "Breakfast favorites", rate_percent: 5, note: "Earn extra cashback before 11am." }
      ]
    };
  }

  async applyBestRewards(orderId, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const order = await this.getOrder(orderId, sessionId);
    if (!order) throw new Error("Order not found.");
    if (order.status !== "draft") throw new Error("Rewards can only be applied to a draft order.");

    const rewardsApplied = chooseBestRewardApplication(order, profile);
    const discountTotal = money(
      Number(rewardsApplied.coupon_discount || 0) +
      Number(rewardsApplied.points_discount || 0)
    );
    setOrderMeta(profile, orderId, {
      discount_total: discountTotal,
      charged_total: money(Math.max(0, Number(order.subtotal || 0) - discountTotal)),
      rewards_applied: rewardsApplied
    });
    return this.getOrder(orderId, sessionId);
  }

  async getTransactionHistory({ limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return [...profile.transactions]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, Math.max(1, Number(limit) || 5));
  }

  async getSpendInsights({ days = 7 } = {}, sessionId = "anonymous") {
    return buildSpendInsights(ensureProfile(this, sessionId), days);
  }

  async getOrderHistory({ restaurantQuery = "", limit = 5 } = {}, sessionId = "anonymous") {
    return buildOrderHistory(ensureProfile(this, sessionId), { restaurantQuery, limit });
  }

  async reorderLastOrder({ restaurantId = "", useUsual = false } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const orderTemplate = findReorderTemplate(profile, { restaurantId, useUsual });
    if (!orderTemplate) return null;
    return this.createOrderDraft({
      restaurantId: orderTemplate.restaurant_id,
      items: orderTemplate.items.map((item) => ({
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        notes: item.notes
      })),
      notes: useUsual ? "Drafted from your usual order." : "Drafted from your order history."
    }, sessionId);
  }

  async saveDealAlert({ query = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const normalized = String(query || "burger deals").trim() || "burger deals";
    if (!profile.dealAlerts.includes(normalized)) profile.dealAlerts.push(normalized);
    return { saved: normalized, alerts: [...profile.dealAlerts] };
  }

  async splitBill({ amount = 0, people = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return buildSplitBill({ amount, people, walletBalance: profile.walletBalance });
  }

  async rechargeWallet({ amount = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 25);
    profile.walletBalance = money(profile.walletBalance + value);
    const tx = recordTransaction(profile, {
      type: "wallet_top_up",
      amount: value,
      direction: "credit",
      merchant: "JhaPay wallet",
      note: "Wallet recharge completed"
    });
    return { amount: value, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async createQrPayment({ amount = 0, merchant = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 18.75);
    if (profile.walletBalance < value) {
      throw new Error(`Not enough JhaPay wallet balance for QR payment. Recharge $${money(value - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - value);
    const tx = recordTransaction(profile, {
      type: "qr_payment",
      amount: value,
      direction: "debit",
      merchant: merchant || "QR merchant",
      note: "QR payment completed"
    });
    return { amount: value, merchant: tx.merchant, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async requestPayment({ amount = 0, recipient = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 24);
    const request = {
      id: crypto.randomUUID(),
      amount: value,
      recipient: recipient || "your friend",
      status: "sent",
      created_at: new Date().toISOString()
    };
    profile.paymentRequests.unshift(request);
    return request;
  }

  async payInvoice({ amount = 0, merchant = "" } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const value = sanitizeMoneyAmount(amount, 42.5);
    if (profile.walletBalance < value) {
      throw new Error(`Not enough JhaPay wallet balance to pay this invoice. Recharge $${money(value - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - value);
    const tx = recordTransaction(profile, {
      type: "invoice_payment",
      amount: value,
      direction: "debit",
      merchant: merchant || "Invoice merchant",
      note: "Invoice paid"
    });
    return { amount: value, merchant: tx.merchant, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async tipAndClose({ amount = 0, tipPercent = 0 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const baseAmount = sanitizeMoneyAmount(amount, 36);
    const safeTipPercent = Math.max(0, Math.min(Number(tipPercent) || 18, 40));
    const tipAmount = money(baseAmount * safeTipPercent / 100);
    const total = money(baseAmount + tipAmount);
    if (profile.walletBalance < total) {
      throw new Error(`Not enough JhaPay wallet balance to close this check. Recharge $${money(total - profile.walletBalance).toFixed(2)} and try again.`);
    }
    profile.walletBalance = money(profile.walletBalance - total);
    const tx = recordTransaction(profile, {
      type: "tip_close",
      amount: total,
      direction: "debit",
      merchant: "Restaurant check",
      note: `Check closed with ${safeTipPercent}% tip`
    });
    return { base_amount: baseAmount, tip_percent: safeTipPercent, tip_amount: tipAmount, total, wallet_balance: profile.walletBalance, transaction: tx };
  }

  async getReceipts({ limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    return [...profile.confirmedOrders]
      .slice()
      .reverse()
      .slice(0, Math.max(1, Number(limit) || 5))
      .map((order) => ({
        receipt_id: order.receipt_id || makeReceiptId(order.id),
        order_id: order.id,
        display_order_id: order.display_order_id,
        merchant: order.restaurant?.name || "Olympic Flame Burgers",
        total: Number(order.payment_summary?.charged_total || order.subtotal || 0),
        created_at: order.confirmed_at || order.created_at
      }));
  }

  async getPersonalizedRecommendations({ restaurantId = "", limit = 5 } = {}, sessionId = "anonymous") {
    const profile = ensureProfile(this, sessionId);
    const candidates = await this.searchMenu({ q: "", restaurantId, limit: 20 });
    return personalizeMenuItems(candidates, profile).slice(0, Math.max(1, Number(limit) || 5));
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

function withWallet(order, profile = null) {
  const meta = profile ? getOrderMeta(profile, order.id) : {};
  const balanceBefore = Number(meta.wallet_balance_before_charge ?? profile?.walletBalance ?? 50);
  const orderTotal = calculateChargeTotal(order, meta);
  const remainingAfter = Number(
    order.status === "confirmed"
      ? meta.wallet_balance_after_charge ?? money(balanceBefore - orderTotal)
      : money(balanceBefore - orderTotal)
  );
  const discountTotal = Number(meta.discount_total || 0);
  return {
    ...order,
    display_order_id: order.display_order_id || makeDisplayOrderId(order.id),
    discount_total: discountTotal,
    final_total: orderTotal,
    rewards_applied: meta.rewards_applied || null,
    receipt_id: meta.receipt_id || null,
    payment_summary: {
      subtotal: money(Number(order.subtotal || 0)),
      discount_total: discountTotal,
      charged_total: orderTotal,
      points_earned: Number(meta.points_earned || 0),
      cashback_earned: Number(meta.cashback_earned || 0)
    },
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

function ensureProfile(store, sessionId) {
  const key = sessionId || "anonymous";
  if (!store.profiles.has(key)) {
    store.profiles.set(key, createDefaultProfile());
  }
  return store.profiles.get(key);
}

function createDefaultProfile() {
  return {
    walletBalance: 50,
    pointsBalance: 120,
    lifetimePoints: 120,
    cashbackBalance: 2.5,
    coupons: [
      { code: "WELCOME5", label: "$5 off orders over $18", kind: "flat", value: 5, minSubtotal: 18, stackable: true },
      { code: "COMBO10", label: "10% off combo meals", kind: "percent", value: 10, minSubtotal: 12, match: "combo", stackable: true }
    ],
    dealAlerts: [],
    paymentRequests: [],
    transactions: [],
    confirmedOrders: [],
    orderMeta: new Map(),
    itemCounts: new Map()
  };
}

function getOrderMeta(profile, orderId) {
  return profile?.orderMeta?.get(orderId) || {};
}

function setOrderMeta(profile, orderId, patch) {
  const previous = getOrderMeta(profile, orderId);
  profile.orderMeta.set(orderId, { ...previous, ...patch });
  return profile.orderMeta.get(orderId);
}

function calculateChargeTotal(order, meta = {}) {
  return money(Math.max(0, Number(meta?.charged_total ?? Number(order.subtotal || 0) - Number(meta?.discount_total || 0))));
}

function estimatePointsEarned(chargeTotal) {
  return Math.max(5, Math.floor(Number(chargeTotal || 0) * 4));
}

function estimateCashbackEarned(order, chargeTotal) {
  const hasCombo = (order.items || []).some((item) => /combo/i.test(item.item_name || ""));
  const hasTaco = (order.items || []).some((item) => /taco/i.test(item.item_name || ""));
  const rate = hasCombo ? 0.08 : hasTaco ? 0.06 : 0.04;
  return money(Number(chargeTotal || 0) * rate);
}

function makeReceiptId(seed) {
  return `R-${makeDisplayOrderId(seed)}`;
}

function sanitizeMoneyAmount(amount, fallback) {
  const parsed = Number(amount);
  if (Number.isFinite(parsed) && parsed > 0) return money(parsed);
  return money(fallback);
}

function chooseBestRewardApplication(order, profile) {
  const subtotal = Number(order.subtotal || 0);
  const applicableCoupons = profile.coupons
    .filter((coupon) => subtotal >= Number(coupon.minSubtotal || 0))
    .filter((coupon) => !coupon.match || (order.items || []).some((item) => String(item.item_name || "").toLowerCase().includes(coupon.match)));
  const bestCoupon = applicableCoupons.sort((a, b) => couponDiscount(order, b) - couponDiscount(order, a))[0] || null;
  const couponDiscountValue = bestCoupon ? couponDiscount(order, bestCoupon) : 0;

  const maxPointBlocks = Math.floor(Number(profile.pointsBalance || 0) / 100);
  const maxDiscountFromPoints = Math.min(maxPointBlocks * 5, subtotal * 0.3);
  const pointsDiscount = money(Math.floor(maxDiscountFromPoints / 5) * 5);
  const pointsUsed = Math.round(pointsDiscount * 20);

  return {
    coupon_code: bestCoupon?.code || null,
    coupon_label: bestCoupon?.label || null,
    coupon_discount: couponDiscountValue,
    points_used: pointsUsed,
    points_discount: pointsDiscount,
    cashback_preview: estimateCashbackEarned(order, Math.max(0, subtotal - couponDiscountValue - pointsDiscount))
  };
}

function couponDiscount(order, coupon) {
  const subtotal = Number(order.subtotal || 0);
  if (!coupon) return 0;
  if (coupon.kind === "percent") return money(subtotal * Number(coupon.value || 0) / 100);
  return money(Number(coupon.value || 0));
}

function recordConfirmedOrder(profile, order) {
  const snapshot = JSON.parse(JSON.stringify(order));
  profile.confirmedOrders.push(snapshot);
  for (const item of snapshot.items || []) {
    const current = profile.itemCounts.get(item.menu_item_id) || {
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      quantity: 0
    };
    current.quantity += Number(item.quantity || 0);
    profile.itemCounts.set(item.menu_item_id, current);
  }
}

function recordTransaction(profile, input) {
  const tx = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...input
  };
  profile.transactions.unshift(tx);
  return tx;
}

function buildRewardsSummary(profile) {
  const nextMilestone = profile.lifetimePoints < 250 ? 250 : profile.lifetimePoints < 500 ? 500 : 1000;
  return {
    points_balance: profile.pointsBalance,
    cashback_balance: money(profile.cashbackBalance),
    available_coupons: profile.coupons.map((coupon) => ({
      code: coupon.code,
      label: coupon.label
    })),
    deal_alerts: [...profile.dealAlerts],
    milestone: {
      current_points: profile.lifetimePoints,
      next_target: nextMilestone,
      remaining_points: Math.max(0, nextMilestone - profile.lifetimePoints)
    },
    favorites: [...profile.itemCounts.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3)
  };
}

function buildSpendInsights(profile, days) {
  const since = Date.now() - Math.max(1, Number(days) || 7) * 24 * 60 * 60 * 1000;
  const spendTransactions = profile.transactions.filter((tx) =>
    tx.direction === "debit" &&
    new Date(tx.created_at).getTime() >= since
  );
  const total = money(spendTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const merchantSpend = new Map();
  for (const tx of spendTransactions) {
    const key = tx.merchant || "Unknown merchant";
    merchantSpend.set(key, money((merchantSpend.get(key) || 0) + Number(tx.amount || 0)));
  }
  const topMerchantEntry = [...merchantSpend.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    days: Math.max(1, Number(days) || 7),
    total_spend: total,
    transaction_count: spendTransactions.length,
    average_ticket: spendTransactions.length ? money(total / spendTransactions.length) : 0,
    top_merchant: topMerchantEntry ? { name: topMerchantEntry[0], amount: topMerchantEntry[1] } : null,
    wallet_balance: money(profile.walletBalance)
  };
}

function buildOrderHistory(profile, { restaurantQuery = "", limit = 5 } = {}) {
  const query = String(restaurantQuery || "").trim().toLowerCase();
  const orders = [...profile.confirmedOrders]
    .slice()
    .reverse()
    .filter((order) => {
      if (!query) return true;
      const haystack = [order.restaurant?.name, order.restaurant?.city, ...order.items.map((item) => item.item_name)].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, Math.max(1, Number(limit) || 5));

  return {
    orders,
    usual_order: findReorderTemplate(profile, { useUsual: true }),
    favorites: [...profile.itemCounts.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3)
  };
}

function findReorderTemplate(profile, { restaurantId = "", useUsual = false } = {}) {
  const recent = [...profile.confirmedOrders]
    .slice()
    .reverse()
    .find((order) => !restaurantId || order.restaurant_id === restaurantId);
  if (!recent) return null;
  if (!useUsual) return recent;

  const topItems = [...profile.itemCounts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 2);
  if (topItems.length === 0) return recent;
  return {
    ...recent,
    items: topItems.map((item) => ({
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      quantity: 1,
      notes: ""
    }))
  };
}

function buildSplitBill({ amount = 0, people = 0, walletBalance = 0 }) {
  const safeAmount = sanitizeMoneyAmount(amount, 0);
  const safePeople = Math.max(2, Math.min(12, Number(people) || 2));
  const perPerson = safeAmount > 0 ? money(safeAmount / safePeople) : 0;
  const remainder = safeAmount > 0 ? money(safeAmount - perPerson * safePeople) : 0;
  return {
    amount: safeAmount,
    people: safePeople,
    per_person: perPerson,
    remainder,
    wallet_balance: money(walletBalance)
  };
}

function personalizeMenuItems(menuItems, profile) {
  const favorites = [...profile.itemCounts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 3);
  if (favorites.length === 0) {
    return [...menuItems].sort((a, b) => (b.demand_score || 0) - (a.demand_score || 0));
  }

  const keywords = favorites
    .flatMap((item) => String(item.item_name || "").toLowerCase().split(/\s+/))
    .filter((token) => token && token.length > 3);

  return [...menuItems]
    .map((item) => {
      const name = String(item.name || "").toLowerCase();
      const keywordMatches = keywords.reduce((sum, token) => sum + (name.includes(token) ? 1 : 0), 0);
      const previousOrders = profile.itemCounts.get(item.id)?.quantity || 0;
      return {
        ...item,
        recommendation_reason: previousOrders > 0 ? "You reorder this often." : keywordMatches > 0 ? "Matches your recent taste profile." : "Popular with similar order patterns.",
        personalization_score: previousOrders * 20 + keywordMatches * 10 + Number(item.demand_score || 0)
      };
    })
    .sort((a, b) => b.personalization_score - a.personalization_score || a.price - b.price)
    .map(({ personalization_score, ...item }) => item);
}

module.exports = { createStore };
