const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const restaurantSelect = document.querySelector("#restaurantSelect");
const newChatButton = document.querySelector("#newChatButton");
const endChatButton = document.querySelector("#endChatButton");
let sessionId = window.localStorage.getItem("restaurantAiSessionId") || "";
const cartItems = new Map();

bootstrap();

async function bootstrap() {
  addMessage("assistant", "Hi. Ask me about lunch, locations, hours, or what you want to order.");
  await loadRestaurants();

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      messageInput.value = button.dataset.prompt;
      messageInput.focus();
    });
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = "";
  await sendChatMessage(message);
});

newChatButton.addEventListener("click", () => resetChat("New chat started. Ask me about lunch, dinner, locations, or ordering."));
endChatButton.addEventListener("click", () => resetChat("Chat ended. Start a new chat when you are ready."));

async function sendChatMessage(message) {
  addMessage("user", message);
  const waiting = addMessage("meta", "Thinking...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        restaurantId: restaurantSelect.value
      })
    });
    const payload = await response.json();
    waiting.remove();

    if (!response.ok) {
      addMessage("assistant", payload.error || "Something went wrong.");
      return;
    }

    sessionId = payload.sessionId;
    window.localStorage.setItem("restaurantAiSessionId", sessionId);
    addMessage("assistant", payload.reply);
    if (payload.context?.order) {
      addOrderCard(payload.context.order, payload.context.intent);
    }
    if (payload.context?.restaurants?.length) {
      addLocationCards(payload.context.restaurants);
    }
    if (payload.context?.menuItems?.length) {
      addMenuOptions(payload.context.menuItems, payload.context.serviceContext);
    }
  } catch (error) {
    waiting.remove();
    addMessage("assistant", `Network error: ${error.message}`);
  }
}

async function loadRestaurants() {
  const response = await fetch("/api/restaurants");
  const payload = await response.json();

  restaurantSelect.innerHTML = payload.restaurants
    .map((restaurant) => {
      const demo = restaurant.is_demo ? " (demo)" : "";
      return `<option value="${escapeHtml(restaurant.id)}">${escapeHtml(restaurant.city)}${demo}</option>`;
    })
    .join("");
}

function addMenuOptions(menuItems, serviceContext) {
  const wrapper = document.createElement("div");
  wrapper.className = "menu-options";
  const cartSummary = document.createElement("div");
  cartSummary.className = "order-builder";

  if (serviceContext) {
    const banner = document.createElement("div");
    banner.className = "service-context";

    const label = document.createElement("strong");
    label.textContent = `${capitalize(serviceContext.display_day_part || serviceContext.day_part)} picks`;

    const details = document.createElement("span");
    details.textContent = `${serviceContext.restaurant_city} time: ${serviceContext.current_time}. Hours: ${serviceContext.hours_label}.${serviceContext.recommendation_note ? ` ${serviceContext.recommendation_note}` : ""}`;

    banner.append(label, details);
    wrapper.appendChild(banner);
  }

  menuItems.slice(0, 6).forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "menu-card";

    const image = document.createElement("img");
    image.src = item.image_url;
    image.alt = item.name;
    image.loading = "lazy";

    const body = document.createElement("div");
    body.className = "menu-card-body";

    const title = document.createElement("h2");
    title.textContent = `${index + 1}. ${item.name}`;

    const meta = document.createElement("p");
    meta.className = "menu-card-meta";
    meta.textContent = `${item.category} - $${Number(item.price).toFixed(2)}`;

    const signals = document.createElement("div");
    signals.className = "menu-signals";
    if (item.is_highly_demanded) {
      const badge = document.createElement("span");
      badge.className = "demand-badge";
      badge.textContent = "Popular now";
      signals.appendChild(badge);
    }
    if (item.demand_score) {
      const demand = document.createElement("span");
      demand.className = "demand-score";
      demand.textContent = `${item.demand_score}% demand`;
      signals.appendChild(demand);
    }

    const description = document.createElement("p");
    description.className = "menu-card-description";
    description.textContent = item.description;

    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "1";
    quantity.max = "20";
    quantity.value = "1";
    quantity.setAttribute("aria-label", `Quantity for ${item.name}`);

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "quantity-button";
    minus.textContent = "-";
    minus.addEventListener("click", () => {
      quantity.value = String(Math.max(1, Number(quantity.value || 1) - 1));
    });

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "quantity-button";
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      quantity.value = String(Math.min(20, Number(quantity.value || 1) + 1));
    });

    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";
    quantityControl.append(minus, quantity, plus);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Add ${index + 1}`;
    button.addEventListener("click", () => addToCart(item, Number(quantity.value || 1), cartSummary));

    const actions = document.createElement("div");
    actions.className = "menu-card-actions";
    actions.append(quantityControl, button);

    body.append(title, meta, signals, description, actions);
    card.append(image, body);
    wrapper.appendChild(card);
  });

  renderCartSummary(cartSummary);
  wrapper.appendChild(cartSummary);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function addLocationCards(restaurants) {
  const wrapper = document.createElement("div");
  wrapper.className = "location-options";

  restaurants.slice(0, 10).forEach((restaurant) => {
    const card = document.createElement("article");
    card.className = "location-card";

    const image = document.createElement("img");
    image.src = restaurant.image_url;
    image.alt = restaurant.name;
    image.loading = "lazy";

    const body = document.createElement("div");
    body.className = "location-card-body";

    const top = document.createElement("div");
    top.className = "location-card-top";

    const titleBlock = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = restaurant.city;
    const name = document.createElement("p");
    name.textContent = restaurant.name;
    titleBlock.append(title, name);

    const badge = document.createElement("span");
    badge.className = restaurant.is_demo ? "location-badge demo" : "location-badge";
    badge.textContent = restaurant.is_demo ? "Demo" : "Live";

    top.append(titleBlock, badge);

    const address = document.createElement("p");
    address.className = "location-address";
    address.textContent = `${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.postal_code}`;

    const details = document.createElement("div");
    details.className = "location-details";
    details.append(locationDetail("Sun-Thu", restaurant.hours?.sun_thu || "Hours unavailable"));
    details.append(locationDetail("Fri-Sat", restaurant.hours?.fri_sat || "Hours unavailable"));
    details.append(locationDetail("Phone", restaurant.phone || "Phone unavailable"));

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Use this pickup";
    button.addEventListener("click", () => {
      restaurantSelect.value = restaurant.id;
      addMessage("assistant", `Pickup location set to ${restaurant.city}.`);
    });

    body.append(top, address, details, button);
    card.append(image, body);
    wrapper.appendChild(card);
  });

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function locationDetail(label, value) {
  const detail = document.createElement("div");
  detail.className = "location-detail";

  const detailLabel = document.createElement("span");
  detailLabel.textContent = label;

  const detailValue = document.createElement("strong");
  detailValue.textContent = value;

  detail.append(detailLabel, detailValue);
  return detail;
}

function addToCart(item, quantity, cartSummary) {
  const safeQuantity = Math.max(1, Math.min(20, Math.trunc(quantity || 1)));
  const existing = cartItems.get(item.id) || { item, quantity: 0 };
  existing.quantity = Math.min(20, existing.quantity + safeQuantity);
  cartItems.set(item.id, existing);
  renderCartSummary(cartSummary);
  scrollIntoChatView(cartSummary);
}

function renderCartSummary(container) {
  container.textContent = "";

  const title = document.createElement("h2");
  title.textContent = "Build draft order";
  container.appendChild(title);

  if (cartItems.size === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Add one or more items with quantity, then draft the order here.";
    container.appendChild(empty);
    return;
  }

  const rows = document.createElement("div");
  rows.className = "builder-items";
  let subtotal = 0;

  cartItems.forEach(({ item, quantity }, itemId) => {
    subtotal += Number(item.price) * quantity;
    const row = document.createElement("div");
    row.className = "builder-row";

    const name = document.createElement("span");
    name.textContent = `${quantity} x ${item.name}`;

    const right = document.createElement("div");
    right.className = "builder-row-actions";

    const price = document.createElement("strong");
    price.textContent = `$${(Number(item.price) * quantity).toFixed(2)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-action";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      cartItems.delete(itemId);
      renderCartSummary(container);
    });

    right.append(price, remove);
    row.append(name, right);
    rows.appendChild(row);
  });

  const footer = document.createElement("div");
  footer.className = "builder-footer";

  const total = document.createElement("strong");
  total.textContent = `Subtotal $${subtotal.toFixed(2)}`;

  const draft = document.createElement("button");
  draft.type = "button";
  draft.textContent = "Draft selected items";
  draft.addEventListener("click", () => draftSelectedItems(container));

  footer.append(total, draft);
  container.append(rows, footer);
}

async function draftSelectedItems(container) {
  if (cartItems.size === 0) return;
  ensureSessionId();

  const items = [...cartItems.values()].map(({ item, quantity }) => ({
    menuItemId: item.id,
    quantity
  }));

  const waiting = addMessage("meta", "Drafting order...");
  try {
    const response = await fetch("/api/orders/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        restaurantId: restaurantSelect.value,
        items,
        notes: "Drafted from menu builder"
      })
    });
    const payload = await response.json();
    waiting.remove();

    if (!response.ok) {
      addMessage("assistant", payload.error || "I could not draft that order.");
      return;
    }

    cartItems.clear();
    renderCartSummary(container);
    addMessage("assistant", "I drafted your selected items. Please confirm or cancel below.");
    addOrderCard(payload.order, "order_draft");
  } catch (error) {
    waiting.remove();
    addMessage("assistant", `Network error: ${error.message}`);
  }
}

function addOrderCard(order, intent) {
  const card = document.createElement("article");
  card.className = "order-card";

  const header = document.createElement("div");
  header.className = "order-card-header";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = intent === "order_confirmed" ? "Confirmed order" : intent === "order_cancelled" ? "Cancelled draft" : "Draft order";
  const displayId = document.createElement("strong");
  displayId.className = "display-order-id";
  displayId.textContent = `#${order.display_order_id || String(order.id).slice(0, 6)}`;
  const location = document.createElement("p");
  location.textContent = `Pickup: ${order.pickup_location || formatPickup(order.restaurant)}`;
  titleBlock.append(title, displayId, location);

  const status = document.createElement("span");
  status.className = `order-status ${order.status}`;
  status.textContent = order.status;

  header.append(titleBlock, status);

  const itemList = document.createElement("div");
  itemList.className = "order-items";
  order.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "order-row";

    const name = document.createElement("span");
    name.textContent = `${item.quantity} x ${item.item_name}`;

    const price = document.createElement("strong");
    price.textContent = `$${(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}`;

    row.append(name, price);
    itemList.appendChild(row);
  });

  const wallet = document.createElement("div");
  wallet.className = "wallet-panel";

  const walletBrand = document.createElement("div");
  walletBrand.className = "wallet-brand";
  const walletSignature = document.createElement("span");
  walletSignature.textContent = "JhaPay";
  const walletCaption = document.createElement("small");
  walletCaption.textContent = "Wallet";
  walletBrand.append(walletSignature, walletCaption);

  const walletNumbers = document.createElement("div");
  walletNumbers.className = "wallet-numbers";

  const balance = walletMetric("Current balance", order.jhapay_wallet?.balance_before, "wallet-balance");
  const total = walletMetric("Order total", order.jhapay_wallet?.order_total || order.subtotal, "wallet-total");
  const remaining = walletMetric("Remaining", order.jhapay_wallet?.remaining_after, "wallet-remaining");
  walletNumbers.append(balance, total, remaining);

  wallet.append(walletBrand, walletNumbers);

  const footer = document.createElement("div");
  footer.className = "order-footer";
  const subtotal = document.createElement("strong");
  subtotal.textContent = `Subtotal $${Number(order.subtotal).toFixed(2)}`;
  footer.appendChild(subtotal);

  if (order.status === "draft") {
    const actions = document.createElement("div");
    actions.className = "order-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary-action";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => sendChatMessage("cancel"));

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Confirm order";
    confirm.addEventListener("click", () => sendChatMessage("confirm"));

    actions.append(cancel, confirm);
    footer.appendChild(actions);
  } else if (order.status === "confirmed") {
    const eta = document.createElement("span");
    eta.className = "pickup-eta";
    eta.textContent = `Ready in about ${order.estimated_pickup_minutes || 18} minutes. Enjoy your food.`;
    footer.appendChild(eta);
  }

  card.append(header, itemList, wallet, footer);
  messages.appendChild(card);
  scrollIntoChatView(card);
}

function walletMetric(label, amount, className) {
  const metric = document.createElement("div");
  metric.className = `wallet-metric ${className}`;

  const metricLabel = document.createElement("span");
  metricLabel.textContent = label;

  const value = document.createElement("strong");
  value.textContent = `$${Number(amount || 0).toFixed(2)}`;

  metric.append(metricLabel, value);
  return metric;
}

function addMessage(role, text) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function scrollIntoChatView(node) {
  requestAnimationFrame(() => {
    node.scrollIntoView({
      behavior: "smooth",
      block: "end",
      inline: "nearest"
    });
  });
}

function ensureSessionId() {
  if (sessionId) return;
  sessionId = crypto.randomUUID();
  window.localStorage.setItem("restaurantAiSessionId", sessionId);
}

function resetChat(message) {
  cartItems.clear();
  sessionId = crypto.randomUUID();
  window.localStorage.setItem("restaurantAiSessionId", sessionId);
  messages.textContent = "";
  addMessage("assistant", message);
  messageInput.value = "";
  messageInput.focus();
}

function formatPickup(restaurant) {
  if (!restaurant) return "Selected restaurant";
  return `${restaurant.name}, ${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.postal_code}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "Menu";
}
