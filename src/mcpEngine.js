const toolDefinitions = [
  {
    name: "list_restaurants",
    description: "Return public restaurant locations, phone numbers, and hours.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "search_menu",
    description: "Search only public menu data by query, day part, and restaurant.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string" },
        day_part: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
        restaurant_id: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "create_order_draft",
    description: "Create a draft order. This does not place the order.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string" },
        items: { type: "array" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        notes: { type: "string" }
      },
      required: ["items"]
    }
  },
  {
    name: "confirm_order",
    description: "Confirm a draft order only after the user explicitly agrees.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" }
      },
      required: ["order_id"]
    }
  },
  {
    name: "cancel_order",
    description: "Cancel a draft order when the user does not want to place it.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" }
      },
      required: ["order_id"]
    }
  },
  {
    name: "get_order",
    description: "Return a public order by id.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" }
      },
      required: ["order_id"]
    }
  }
];

function createMcpEngine(store) {
  const tools = {
    list_restaurants: async () => store.listRestaurants(),
    search_menu: async (input) =>
      store.searchMenu({
        q: input.q,
        dayPart: input.day_part,
        restaurantId: input.restaurant_id,
        limit: input.limit
      }),
    create_order_draft: async (input) =>
      store.createOrderDraft({
        restaurantId: input.restaurant_id,
        items: input.items,
        customerName: input.customer_name,
        customerPhone: input.customer_phone,
        notes: input.notes
      }),
    confirm_order: async (input) => store.confirmOrder(input.order_id),
    cancel_order: async (input) => store.cancelOrder(input.order_id),
    get_order: async (input) => store.getOrder(input.order_id)
  };

  return {
    definitions: toolDefinitions,
    async execute(toolName, input = {}, sessionId = "anonymous") {
      const tool = tools[toolName];
      if (!tool) {
        throw new Error(`Tool is not allowed: ${toolName}`);
      }
      await store.auditTool(sessionId, toolName, input);
      return tool(input);
    }
  };
}

module.exports = { createMcpEngine, toolDefinitions };
