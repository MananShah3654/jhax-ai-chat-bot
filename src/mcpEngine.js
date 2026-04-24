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
  },
  {
    name: "get_rewards_summary",
    description: "Return the wallet-linked rewards, coupons, cashback, and milestone summary for the current user.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "apply_best_rewards",
    description: "Apply the best available rewards and coupon combination to a draft order.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" }
      },
      required: ["order_id"]
    }
  },
  {
    name: "get_cashback_offers",
    description: "Return active cashback offers for the selected merchant.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string" }
      }
    }
  },
  {
    name: "get_transaction_history",
    description: "Return recent JhaPay transactions for the current user.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_spend_insights",
    description: "Return recent spend totals and merchant insights for the current user.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number" }
      }
    }
  },
  {
    name: "get_order_history",
    description: "Return past confirmed orders and favorite items for the current user.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_query: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "reorder_last_order",
    description: "Draft a reorder from the user's last or usual order.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string" },
        use_usual: { type: "boolean" }
      }
    }
  },
  {
    name: "save_deal_alert",
    description: "Save a deal alert preference for the current user.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" }
      }
    }
  },
  {
    name: "split_bill",
    description: "Calculate a split-bill breakdown.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        people: { type: "number" }
      }
    }
  },
  {
    name: "recharge_wallet",
    description: "Top up the current user's JhaPay wallet.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" }
      }
    }
  },
  {
    name: "create_qr_payment",
    description: "Simulate a QR-based merchant payment from the current user's wallet.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        merchant: { type: "string" }
      }
    }
  },
  {
    name: "request_payment",
    description: "Create a payment request for another person.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        recipient: { type: "string" }
      }
    }
  },
  {
    name: "pay_invoice",
    description: "Simulate paying an invoice from the current user's wallet.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        merchant: { type: "string" }
      }
    }
  },
  {
    name: "tip_and_close",
    description: "Simulate closing a check with tip from the current user's wallet.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        tip_percent: { type: "number" }
      }
    }
  },
  {
    name: "get_receipts",
    description: "Return recent receipt references for the current user.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_personalized_recommendations",
    description: "Return personalized menu suggestions based on the user's order history.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string" },
        limit: { type: "number" }
      }
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
    create_order_draft: async (input, sessionId) =>
      store.createOrderDraft({
        restaurantId: input.restaurant_id,
        items: input.items,
        customerName: input.customer_name,
        customerPhone: input.customer_phone,
        notes: input.notes
      }, sessionId),
    confirm_order: async (input, sessionId) => store.confirmOrder(input.order_id, sessionId),
    cancel_order: async (input, sessionId) => store.cancelOrder(input.order_id, sessionId),
    get_order: async (input, sessionId) => store.getOrder(input.order_id, sessionId),
    get_rewards_summary: async (_, sessionId) => store.getRewardsSummary(sessionId),
    apply_best_rewards: async (input, sessionId) => store.applyBestRewards(input.order_id, sessionId),
    get_cashback_offers: async (input, sessionId) => store.getCashbackOffers({ restaurantId: input.restaurant_id }, sessionId),
    get_transaction_history: async (input, sessionId) => store.getTransactionHistory({ limit: input.limit }, sessionId),
    get_spend_insights: async (input, sessionId) => store.getSpendInsights({ days: input.days }, sessionId),
    get_order_history: async (input, sessionId) => store.getOrderHistory({ restaurantQuery: input.restaurant_query, limit: input.limit }, sessionId),
    reorder_last_order: async (input, sessionId) => store.reorderLastOrder({ restaurantId: input.restaurant_id, useUsual: input.use_usual }, sessionId),
    save_deal_alert: async (input, sessionId) => store.saveDealAlert({ query: input.query }, sessionId),
    split_bill: async (input, sessionId) => store.splitBill({ amount: input.amount, people: input.people }, sessionId),
    recharge_wallet: async (input, sessionId) => store.rechargeWallet({ amount: input.amount }, sessionId),
    create_qr_payment: async (input, sessionId) => store.createQrPayment({ amount: input.amount, merchant: input.merchant }, sessionId),
    request_payment: async (input, sessionId) => store.requestPayment({ amount: input.amount, recipient: input.recipient }, sessionId),
    pay_invoice: async (input, sessionId) => store.payInvoice({ amount: input.amount, merchant: input.merchant }, sessionId),
    tip_and_close: async (input, sessionId) => store.tipAndClose({ amount: input.amount, tipPercent: input.tip_percent }, sessionId),
    get_receipts: async (input, sessionId) => store.getReceipts({ limit: input.limit }, sessionId),
    get_personalized_recommendations: async (input, sessionId) => store.getPersonalizedRecommendations({ restaurantId: input.restaurant_id, limit: input.limit }, sessionId)
  };

  return {
    definitions: toolDefinitions,
    async execute(toolName, input = {}, sessionId = "anonymous") {
      const tool = tools[toolName];
      if (!tool) {
        throw new Error(`Tool is not allowed: ${toolName}`);
      }
      await store.auditTool(sessionId, toolName, input);
      return tool(input, sessionId);
    }
  };
}

module.exports = { createMcpEngine, toolDefinitions };
