const { createStore } = require("./db");
const { createMcpEngine } = require("./mcpEngine");

async function run() {
  const store = await createStore();
  const mcp = createMcpEngine(store);
  const sessionId = "smoke";
  const restaurants = await mcp.execute("list_restaurants", {}, "smoke");
  const lunch = await mcp.execute("search_menu", { q: "lunch burger", day_part: "lunch" }, sessionId);
  const bestTacos = await mcp.execute("search_menu", { q: "tacos", day_part: "" }, sessionId);
  const tacosOnly = bestTacos.every((item) => `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes("taco"));
  const rewardsBefore = await mcp.execute("get_rewards_summary", {}, sessionId);
  const order = await mcp.execute(
    "create_order_draft",
    {
      restaurant_id: restaurants[0].id,
      items: [
        { menuItemId: lunch[0].id, quantity: 1 },
        { menuItemId: lunch[1].id, quantity: 1 }
      ]
    },
    sessionId
  );
  const discounted = await mcp.execute("apply_best_rewards", { order_id: order.id }, sessionId);
  const confirmed = await mcp.execute("confirm_order", { order_id: order.id }, sessionId);
  const rewardsAfter = await mcp.execute("get_rewards_summary", {}, sessionId);
  const txHistory = await mcp.execute("get_transaction_history", { limit: 5 }, sessionId);
  const spendInsights = await mcp.execute("get_spend_insights", { days: 7 }, sessionId);
  const orderHistory = await mcp.execute("get_order_history", { limit: 5 }, sessionId);
  const receipts = await mcp.execute("get_receipts", { limit: 5 }, sessionId);
  const split = await mcp.execute("split_bill", { amount: confirmed.final_total, people: 3 }, sessionId);
  const recharge = await mcp.execute("recharge_wallet", { amount: 40 }, sessionId);
  const qrPayment = await mcp.execute("create_qr_payment", { amount: 12.5, merchant: "Smoke QR Merchant" }, sessionId);
  const recommendations = await mcp.execute("get_personalized_recommendations", { restaurant_id: restaurants[0].id, limit: 3 }, sessionId);
  const reorder = await mcp.execute("reorder_last_order", { restaurant_id: restaurants[0].id, use_usual: true }, sessionId);

  console.log(JSON.stringify({
    mode: store.mode,
    restaurantCount: restaurants.length,
    firstLunchItem: lunch[0].name,
    bestTaco: bestTacos[0].name,
    bestTacoDemand: bestTacos[0].demand_score,
    tacosOnly,
    draftItems: order.items.length,
    displayOrderId: `#${order.display_order_id}`,
    pickup: order.pickup_location,
    discountedTotal: discounted.final_total,
    rewardsApplied: discounted.rewards_applied,
    orderStatus: confirmed.status,
    subtotal: confirmed.subtotal,
    chargedTotal: confirmed.final_total,
    jhapayRemaining: confirmed.jhapay_wallet.remaining_after,
    estimatedPickupMinutes: confirmed.estimated_pickup_minutes,
    rewardsBeforePoints: rewardsBefore.points_balance,
    rewardsAfterPoints: rewardsAfter.points_balance,
    transactionsLogged: txHistory.length,
    spendTotal7d: spendInsights.total_spend,
    orderHistoryCount: orderHistory.orders.length,
    firstReceipt: receipts[0]?.receipt_id || null,
    splitPerPerson: split.per_person,
    walletAfterRecharge: recharge.wallet_balance,
    walletAfterQr: qrPayment.wallet_balance,
    personalizedTopPick: recommendations[0]?.name || null,
    reorderDraftItems: reorder?.items?.length || 0
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
