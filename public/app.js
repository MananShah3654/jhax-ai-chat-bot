const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const restaurantSelect = document.querySelector("#restaurantSelect");
const newChatButton = document.querySelector("#newChatButton");
const endChatButton = document.querySelector("#endChatButton");
const assistantDrawer = document.querySelector("#assistantDrawer");
const mobileMenuButton = document.querySelector("#mobileMenuButton");
const mobilePanelClose = document.querySelector("#mobilePanelClose");
const mobileBackdrop = document.querySelector("#mobileBackdrop");
const mobileHeaderNewChat = document.querySelector("#mobileHeaderNewChat");
const panelContent = document.querySelector("#panelContent");
const promptNavItems = [...document.querySelectorAll("[data-prompt-tab]")];
const promptPanels = [...document.querySelectorAll("[data-prompt-panel]")];
const sendButton = chatForm.querySelector(".composer-send");
let sessionId = window.localStorage.getItem("restaurantAiSessionId") || "";
const cartItems = new Map();

bootstrap();

async function bootstrap() {
  addMessage("assistant", "Hi. I'm JhaPay AI — your conversational commerce assistant.\n\nI can help you discover restaurants, build an order, pay with your JhaPay wallet, and much more. Tap the menu icon for modes, or just type below.");
  await loadRestaurants();
  if (mobileMenuButton) mobileMenuButton.addEventListener("click", toggleMobilePanel);
  if (mobilePanelClose) mobilePanelClose.addEventListener("click", closeMobilePanel);
  if (mobileBackdrop) mobileBackdrop.addEventListener("click", closeMobilePanel);
  if (mobileHeaderNewChat) mobileHeaderNewChat.addEventListener("click", () => resetChat("New chat started. How can I help you today?"));
  syncMobilePanelState();
  bindPromptWorkspace();
  syncSendButton();
  messageInput.addEventListener("input", syncSendButton);
  document.querySelectorAll("[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      messageInput.value = btn.dataset.prompt;
      closeMobilePanel();
      syncSendButton();
      messageInput.focus();
    });
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  messageInput.value = "";
  syncSendButton();
  await sendChatMessage(message);
});

function syncSendButton() {
  if (!sendButton) return;
  sendButton.disabled = messageInput.value.trim().length === 0;
}

newChatButton.addEventListener("click", () => resetChat("New chat started. How can I help you today?"));
endChatButton.addEventListener("click", () => resetChat("Chat ended. Start a new chat when you are ready."));
window.addEventListener("resize", syncMobilePanelState);

// ─── Streaming Chat ───────────────────────────────────────────────────────────

async function sendChatMessage(message) {
  addMessage("user", message);
  const aiMsgEl = addStreamingMessage();

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message, restaurantId: restaurantSelect.value })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      aiMsgEl.classList.remove("streaming");
      aiMsgEl.textContent = payload.error || "Something went wrong.";
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete line

      for (const part of parts) {
        const line = part.startsWith("data: ") ? part.slice(6) : part;
        if (!line.trim()) continue;
        let data;
        try { data = JSON.parse(line); } catch { continue; }

        if (data.done) {
          aiMsgEl.classList.remove("streaming");
          if (data.sessionId) {
            sessionId = data.sessionId;
            window.localStorage.setItem("restaurantAiSessionId", sessionId);
          }
          renderContextCards(data.context);
          scrollIntoChatView(aiMsgEl);
          return;
        }

        fullText += data.token;
        aiMsgEl.textContent = fullText;
        messages.scrollTop = messages.scrollHeight;
      }
    }

    aiMsgEl.classList.remove("streaming");
  } catch (error) {
    aiMsgEl.classList.remove("streaming");
    aiMsgEl.textContent = `Network error: ${error.message}`;
  }
}

function addStreamingMessage() {
  const node = document.createElement("div");
  node.className = "message assistant streaming";
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function renderContextCards(context) {
  if (!context) return;
  if (context.order) addOrderCard(context.order, context.intent);
  if (context.restaurants?.length) addLocationCards(context.restaurants);
  if (context.menuItems?.length) addMenuOptions(context.menuItems, context.serviceContext);
}

// ─── Restaurant Loader ────────────────────────────────────────────────────────

async function loadRestaurants() {
  const response = await fetch("/api/restaurants");
  const payload = await response.json();
  restaurantSelect.innerHTML = payload.restaurants
    .map((r) => {
      const demo = r.is_demo ? " (demo)" : "";
      return `<option value="${escapeHtml(r.id)}">${escapeHtml(r.city)}${demo}</option>`;
    })
    .join("");
}

// ─── Menu Options ─────────────────────────────────────────────────────────────

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
    meta.textContent = `${item.category} — $${Number(item.price).toFixed(2)}`;

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
    quantity.type = "number"; quantity.min = "1"; quantity.max = "20"; quantity.value = "1";
    quantity.setAttribute("aria-label", `Quantity for ${item.name}`);

    const minus = document.createElement("button");
    minus.type = "button"; minus.className = "quantity-button"; minus.textContent = "−";
    minus.addEventListener("click", () => { quantity.value = String(Math.max(1, Number(quantity.value || 1) - 1)); });

    const plus = document.createElement("button");
    plus.type = "button"; plus.className = "quantity-button"; plus.textContent = "+";
    plus.addEventListener("click", () => { quantity.value = String(Math.min(20, Number(quantity.value || 1) + 1)); });

    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";
    quantityControl.append(minus, quantity, plus);

    const button = document.createElement("button");
    button.type = "button"; button.textContent = `Add ${index + 1}`;
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

// ─── Location Cards ───────────────────────────────────────────────────────────

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
    details.append(
      locationDetail("Sun-Thu", restaurant.hours?.sun_thu || "Hours unavailable"),
      locationDetail("Fri-Sat", restaurant.hours?.fri_sat || "Hours unavailable"),
      locationDetail("Phone", restaurant.phone || "Phone unavailable")
    );

    const button = document.createElement("button");
    button.type = "button"; button.textContent = "Use this pickup";
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
  const detailLabel = document.createElement("span"); detailLabel.textContent = label;
  const detailValue = document.createElement("strong"); detailValue.textContent = value;
  detail.append(detailLabel, detailValue);
  return detail;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

function addToCart(item, quantity, cartSummary) {
  const safeQty = Math.max(1, Math.min(20, Math.trunc(quantity || 1)));
  const existing = cartItems.get(item.id) || { item, quantity: 0 };
  existing.quantity = Math.min(20, existing.quantity + safeQty);
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
    empty.textContent = "Add one or more items, then draft the order here.";
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

    const nameEl = document.createElement("span");
    nameEl.textContent = `${quantity} x ${item.name}`;

    const right = document.createElement("div");
    right.className = "builder-row-actions";

    const price = document.createElement("strong");
    price.textContent = `$${(Number(item.price) * quantity).toFixed(2)}`;

    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "text-action"; remove.textContent = "Remove";
    remove.addEventListener("click", () => { cartItems.delete(itemId); renderCartSummary(container); });

    right.append(price, remove);
    row.append(nameEl, right);
    rows.appendChild(row);
  });

  const footer = document.createElement("div");
  footer.className = "builder-footer";

  const total = document.createElement("strong");
  total.textContent = `Subtotal $${subtotal.toFixed(2)}`;

  const draft = document.createElement("button");
  draft.type = "button"; draft.textContent = "Draft selected items";
  draft.addEventListener("click", () => draftSelectedItems(container));

  footer.append(total, draft);
  container.append(rows, footer);
}

async function draftSelectedItems(container) {
  if (cartItems.size === 0) return;
  ensureSessionId();

  const items = [...cartItems.values()].map(({ item, quantity }) => ({ menuItemId: item.id, quantity }));
  const waiting = addMessage("meta", "Drafting order...");

  try {
    const response = await fetch("/api/orders/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, restaurantId: restaurantSelect.value, items, notes: "Drafted from menu builder" })
    });
    const payload = await response.json();
    waiting.remove();

    if (!response.ok) { addMessage("assistant", payload.error || "I could not draft that order."); return; }

    cartItems.clear();
    renderCartSummary(container);
    addMessage("assistant", "I drafted your selected items. Please confirm or cancel below.");
    addOrderCard(payload.order, "order_draft");
  } catch (error) {
    waiting.remove();
    addMessage("assistant", `Network error: ${error.message}`);
  }
}

// ─── Order Card ───────────────────────────────────────────────────────────────

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
    const nameEl = document.createElement("span");
    nameEl.textContent = `${item.quantity} x ${item.item_name}`;
    const price = document.createElement("strong");
    price.textContent = `$${(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}`;
    row.append(nameEl, price);
    itemList.appendChild(row);
  });

  const wallet = document.createElement("div");
  wallet.className = "wallet-panel";
  const walletBrand = document.createElement("div");
  walletBrand.className = "wallet-brand";
  const walletSig = document.createElement("span"); walletSig.textContent = "JhaPay";
  const walletCap = document.createElement("small"); walletCap.textContent = "Wallet";
  walletBrand.append(walletSig, walletCap);

  const walletNumbers = document.createElement("div");
  walletNumbers.className = "wallet-numbers";
  walletNumbers.append(
    walletMetric("Current balance", order.jhapay_wallet?.balance_before, "wallet-balance"),
    walletMetric("Order total", order.jhapay_wallet?.order_total || order.subtotal, "wallet-total"),
    walletMetric("Remaining", order.jhapay_wallet?.remaining_after, "wallet-remaining")
  );
  wallet.append(walletBrand, walletNumbers);

  const footer = document.createElement("div");
  footer.className = "order-footer";
  const totals = document.createElement("div");
  totals.className = "order-totals";
  const subtotal = document.createElement("strong");
  subtotal.textContent = `Subtotal $${Number(order.subtotal).toFixed(2)}`;
  totals.appendChild(subtotal);
  if (Number(order.discount_total || 0) > 0) {
    const discount = document.createElement("span");
    discount.className = "pickup-eta";
    discount.textContent = `Discounts -$${Number(order.discount_total).toFixed(2)}`;
    totals.appendChild(discount);
  }
  const total = document.createElement("strong");
  total.textContent = `Total $${Number(order.final_total || order.payment_summary?.charged_total || order.subtotal).toFixed(2)}`;
  totals.appendChild(total);
  footer.appendChild(totals);

  if (order.status === "draft") {
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "secondary-action"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => sendChatMessage("cancel"));
    const confirm = document.createElement("button");
    confirm.type = "button"; confirm.textContent = "Confirm order";
    confirm.addEventListener("click", () => sendChatMessage("confirm"));
    actions.append(cancel, confirm);
    footer.appendChild(actions);
  } else if (order.status === "confirmed") {
    const eta = document.createElement("span");
    eta.className = "pickup-eta";
    const earnedPoints = Number(order.payment_summary?.points_earned || 0);
    const cashback = Number(order.payment_summary?.cashback_earned || 0);
    eta.textContent = `Ready in about ${order.estimated_pickup_minutes || 18} minutes. Earned ${earnedPoints} points and $${cashback.toFixed(2)} cashback.`;
    footer.appendChild(eta);
  }

  card.append(header, itemList, wallet, footer);
  messages.appendChild(card);
  scrollIntoChatView(card);
}

function walletMetric(label, amount, className) {
  const metric = document.createElement("div");
  metric.className = `wallet-metric ${className}`;
  const metricLabel = document.createElement("span"); metricLabel.textContent = label;
  const value = document.createElement("strong"); value.textContent = `$${Number(amount || 0).toFixed(2)}`;
  metric.append(metricLabel, value);
  return metric;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function addMessage(role, text) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function scrollIntoChatView(node) {
  requestAnimationFrame(() => node.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" }));
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
  closeMobilePanel();
  messageInput.value = "";
  messageInput.focus();
}

function toggleMobilePanel() {
  if (isMobilePanelOpen()) closeMobilePanel();
  else openMobilePanel();
}

function openMobilePanel() {
  if (!isMobileLayout() || !assistantDrawer) return;
  assistantDrawer.classList.add("mobile-open");
  panelContent?.classList.add("mobile-open");
  document.body.classList.add("drawer-open");
  if (mobileBackdrop) mobileBackdrop.hidden = false;
  if (mobileMenuButton) {
    mobileMenuButton.setAttribute("aria-expanded", "true");
    mobileMenuButton.setAttribute("aria-label", "Close menu");
  }
}

function closeMobilePanel() {
  if (!assistantDrawer) return;
  assistantDrawer.classList.remove("mobile-open");
  panelContent?.classList.remove("mobile-open");
  document.body.classList.remove("drawer-open");
  if (mobileBackdrop) mobileBackdrop.hidden = true;
  if (mobileMenuButton) {
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Open menu");
  }
}

function syncMobilePanelState() {
  if (!assistantDrawer) return;
  if (!isMobileLayout()) closeMobilePanel();
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 780px)").matches;
}

function isMobilePanelOpen() {
  return assistantDrawer?.classList.contains("mobile-open");
}

function bindPromptWorkspace() {
  if (promptNavItems.length === 0 || promptPanels.length === 0) return;
  promptNavItems.forEach((item) => {
    item.addEventListener("click", () => {
      const tab = item.dataset.promptTab;
      const alreadyOpen = item.classList.contains("active");
      setActivePromptTab(alreadyOpen ? null : tab);
    });
  });
  const initial = promptNavItems.find((item) => item.classList.contains("active"))?.dataset.promptTab || promptNavItems[0].dataset.promptTab;
  setActivePromptTab(initial);
}

function setActivePromptTab(tab) {
  promptNavItems.forEach((item) => {
    const active = item.dataset.promptTab === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-expanded", String(active));
  });
  promptPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.promptPanel === tab);
  });
}

function formatPickup(restaurant) {
  if (!restaurant) return "Selected restaurant";
  return `${restaurant.name}, ${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.postal_code}`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "Menu";
}
