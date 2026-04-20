const { createStore } = require("./db");
const { createMcpEngine } = require("./mcpEngine");

async function run() {
  const store = await createStore();
  const mcp = createMcpEngine(store);
  const restaurants = await mcp.execute("list_restaurants", {}, "smoke");
  const lunch = await mcp.execute("search_menu", { q: "lunch burger", day_part: "lunch" }, "smoke");
  const bestTacos = await mcp.execute("search_menu", { q: "tacos", day_part: "" }, "smoke");
  const tacosOnly = bestTacos.every((item) => `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes("taco"));
  const order = await mcp.execute(
    "create_order_draft",
    {
      restaurant_id: restaurants[0].id,
      items: [
        { menuItemId: lunch[0].id, quantity: 2 },
        { menuItemId: lunch[1].id, quantity: 1 }
      ]
    },
    "smoke"
  );
  const confirmed = await mcp.execute("confirm_order", { order_id: order.id }, "smoke");

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
    orderStatus: confirmed.status,
    subtotal: confirmed.subtotal,
    jhapayRemaining: confirmed.jhapay_wallet.remaining_after,
    estimatedPickupMinutes: confirmed.estimated_pickup_minutes
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
