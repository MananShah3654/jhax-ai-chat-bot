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
const micButton = document.querySelector("#composerMic");
let sessionId = window.localStorage.getItem("restaurantAiSessionId") || "";
const cartItems = new Map();
let speechRecognition = null;
let isListening = false;

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
  setupVoiceInput();
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
  const empty = messageInput.value.trim().length === 0;
  sendButton.disabled = empty;
  chatForm.classList.toggle("has-text", !empty);
}

// ─── Voice Input ──────────────────────────────────────────────────────────────

function setupVoiceInput() {
  if (!micButton) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // mic stays hidden on unsupported browsers (e.g. Firefox); always show send instead.
    chatForm.classList.add("no-voice");
    return;
  }

  const voiceIndicator = document.querySelector("#voiceIndicator");
  const composerCard = chatForm.querySelector(".composer-card");
  const defaultPlaceholder = messageInput.getAttribute("placeholder") || "Reply...";
  const SILENCE_MS = 3000;
  let baseValue = "";
  let silenceTimer = null;
  let cancelRequested = false;
  let voiceCaptured = false;

  micButton.hidden = false;
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 3;
  speechRecognition.lang = "en-IN";

  function showListeningUi() {
    if (voiceIndicator) voiceIndicator.hidden = false;
    if (composerCard) composerCard.classList.add("listening");
    chatForm.classList.add("is-listening");
    micButton.classList.add("listening");
    micButton.setAttribute("aria-label", "Stop voice input");
    messageInput.setAttribute("placeholder", "Listening…");
  }

  function hideListeningUi() {
    if (voiceIndicator) voiceIndicator.hidden = true;
    if (composerCard) composerCard.classList.remove("listening");
    chatForm.classList.remove("is-listening");
    micButton.classList.remove("listening");
    micButton.setAttribute("aria-label", "Voice input");
    messageInput.setAttribute("placeholder", defaultPlaceholder);
  }

  function bumpSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      try { speechRecognition.stop(); } catch (_) { /* already stopped */ }
    }, SILENCE_MS);
  }

  function submitTranscript() {
    if (typeof chatForm.requestSubmit === "function") chatForm.requestSubmit();
    else chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }

  speechRecognition.onstart = () => {
    isListening = true;
    baseValue = messageInput.value ? messageInput.value.trimEnd() + " " : "";
    cancelRequested = false;
    voiceCaptured = false;
    showListeningUi();
    bumpSilenceTimer();
  };

  speechRecognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim().length > 0) voiceCaptured = true;
    messageInput.value = (baseValue + transcript).trimStart();
    syncSendButton();
    bumpSilenceTimer();
  };

  speechRecognition.onend = () => {
    clearTimeout(silenceTimer);
    isListening = false;
    hideListeningUi();
    const hasText = messageInput.value.trim().length > 0;
    const shouldSubmit = !cancelRequested && voiceCaptured && hasText;
    cancelRequested = false;
    voiceCaptured = false;
    if (shouldSubmit) submitTranscript();
    else messageInput.focus();
  };

  speechRecognition.onerror = (event) => {
    clearTimeout(silenceTimer);
    cancelRequested = true; // suppress auto-submit on error
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      addMessage("meta", "Microphone access is blocked. Allow it in your browser settings to use voice input.");
    }
    isListening = false;
    hideListeningUi();
  };

  micButton.addEventListener("click", () => {
    if (isListening) {
      cancelRequested = true; // user clicked to cancel — do NOT auto-submit
      try { speechRecognition.stop(); } catch (_) { /* ignore */ }
      return;
    }
    try {
      speechRecognition.start();
    } catch (error) {
      console.warn("Could not start voice input:", error);
    }
  });
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
  if (context.flights?.length) addFlightOptions(context.flights, context.flightSlots);
  if (context.hotels?.length) addHotelOptions(context.hotels, context.hotelSlots);
  if (context.booking) {
    if ((context.intent || "").startsWith("hotel_")) addHotelBookingCard(context.booking, context.intent);
    else addFlightBookingCard(context.booking, context.intent);
  }
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

// ─── Flight Options ───────────────────────────────────────────────────────────

function addFlightOptions(flights, slots) {
  const wrapper = document.createElement("div");
  wrapper.className = "flight-options";

  if (slots) {
    const summary = document.createElement("div");
    summary.className = "flight-summary";
    const route = `${slots.origin} → ${slots.destination}`;
    const date = formatFlightDate(slots.departDate);
    const pax = `${slots.passengers || 1} ${Number(slots.passengers) === 1 ? "traveler" : "travelers"}`;
    const cabin = (slots.cabinClass || "economy").replace("_", " ");
    summary.innerHTML = `<strong>${route}</strong><span>${date} · ${pax} · ${cabin}</span>`;
    wrapper.appendChild(summary);
  }

  flights.slice(0, 4).forEach((flight, index) => {
    wrapper.appendChild(buildFlightCard(flight, index));
  });

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function buildFlightCard(flight, index) {
  const card = document.createElement("article");
  card.className = "flight-card";

  const slice = flight.slices?.[0] || {};
  const firstSeg = slice.segments?.[0] || {};
  const lastSeg = slice.segments?.[slice.segments.length - 1] || {};
  const stopLabel = slice.stops === 0
    ? "Direct"
    : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}`;
  const airlineName = flight.airline?.name || "Airline";
  const dealsLabel = `Offer ${index + 1}`;

  // Left side — airline + route
  const main = document.createElement("div");
  main.className = "flight-card-main";

  const airline = document.createElement("div");
  airline.className = "flight-card-airline";
  airline.innerHTML = `<span class="flight-card-airline-name">${escapeHtml(airlineName)}</span>`;

  const route = document.createElement("div");
  route.className = "flight-card-route";

  const depart = document.createElement("div");
  depart.className = "flight-card-endpoint";
  depart.innerHTML = `
    <strong>${escapeHtml(formatTime(firstSeg.departing_at))}</strong>
    <span>${escapeHtml(slice.origin || firstSeg.origin || "")}</span>
  `;

  const path = document.createElement("div");
  path.className = "flight-card-path";
  path.innerHTML = `
    <span class="flight-card-duration">${escapeHtml(slice.duration_label || "")}</span>
    <div class="flight-card-line" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class="flight-card-plane" aria-hidden="true">
        <path d="M2.5 19.5l19-7.5-19-7.5 1 6.5 12 1-12 1z"/>
      </svg>
    </div>
    <span class="flight-card-stops">${escapeHtml(stopLabel)}</span>
  `;

  const arrive = document.createElement("div");
  arrive.className = "flight-card-endpoint";
  arrive.innerHTML = `
    <strong>${escapeHtml(formatTime(lastSeg.arriving_at))}</strong>
    <span>${escapeHtml(slice.destination || lastSeg.destination || "")}</span>
  `;
  route.append(depart, path, arrive);
  main.append(airline, route);

  // Right side — price + Select button
  const aside = document.createElement("div");
  aside.className = "flight-card-aside";

  const priceBlock = document.createElement("div");
  priceBlock.className = "flight-card-price";
  priceBlock.innerHTML = `
    <span class="flight-card-deal">${escapeHtml(dealsLabel)}</span>
    <strong>${escapeHtml(formatFlightPrice(flight.total_amount, flight.total_currency))}</strong>
  `;

  const select = document.createElement("button");
  select.type = "button";
  select.className = "flight-card-select";
  select.innerHTML = `Select <span aria-hidden="true">→</span>`;
  select.addEventListener("click", () => {
    const wrapper = card.parentElement;
    if (wrapper) {
      wrapper.querySelectorAll(".flight-card").forEach((sibling) => {
        sibling.classList.toggle("flight-card-selected", sibling === card);
        sibling.classList.toggle("flight-card-dimmed", sibling !== card);
        const siblingBtn = sibling.querySelector(".flight-card-select");
        if (siblingBtn) siblingBtn.disabled = true;
      });
      const thisBtn = card.querySelector(".flight-card-select");
      if (thisBtn) thisBtn.textContent = "Selected";
    }
    messageInput.value = `book flight ${index + 1}`;
    if (typeof chatForm.requestSubmit === "function") chatForm.requestSubmit();
    else chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });

  aside.append(priceBlock, select);
  card.append(main, aside);
  return card;
}

function addFlightBookingCard(booking, intent) {
  const offer = booking.offer || {};
  const slice = offer.slices?.[0] || {};
  const firstSeg = slice.segments?.[0] || {};
  const lastSeg = slice.segments?.[slice.segments.length - 1] || firstSeg;
  const wallet = booking.jhapay_wallet || {};
  const fare = booking.fare || {};
  const passengers = booking.passengers || [];
  const stopLabel = slice.stops === 0
    ? "Non-stop"
    : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}`;
  const flightCode = slice.segments?.map((s) => s.flight_number).filter(Boolean).join(" + ") || "";
  const status = intent === "flight_booking_confirmed"
    ? "confirmed"
    : intent === "flight_booking_cancelled"
      ? "cancelled"
      : "draft";

  const card = document.createElement("article");
  card.className = "booking-card";

  // Header
  const header = document.createElement("div");
  header.className = "booking-card-header";
  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = status === "confirmed"
    ? "Confirmed flight booking"
    : status === "cancelled"
      ? "Cancelled draft"
      : "Draft flight booking";
  titleBlock.appendChild(title);
  if (status === "confirmed" && booking.pnr) {
    const pnr = document.createElement("strong");
    pnr.className = "booking-pnr";
    pnr.textContent = `PNR ${booking.pnr}`;
    titleBlock.appendChild(pnr);
  }
  const route = document.createElement("p");
  route.className = "booking-route-line";
  route.textContent = `${slice.origin || ""} → ${slice.destination || ""} · ${formatFlightDate(firstSeg.departing_at?.slice(0, 10))}`;
  titleBlock.appendChild(route);

  const statusBadge = document.createElement("span");
  statusBadge.className = `order-status ${status}`;
  statusBadge.textContent = status;
  header.append(titleBlock, statusBadge);

  // Flight summary row
  const cabinLabel = (offer.cabin_class_marketing_name || offer.cabin_class || "economy").replace("_", " ");
  const summary = document.createElement("div");
  summary.className = "booking-flight-summary";
  summary.innerHTML = `
    <div class="booking-flight-airline">
      <strong>${escapeHtml(offer.airline?.name || "Airline")}</strong>
      <span>${escapeHtml(flightCode)} · ${escapeHtml(stopLabel)} · ${escapeHtml(cabinLabel)}</span>
    </div>
    <div class="booking-flight-route">
      <div class="booking-flight-endpoint">
        <strong>${escapeHtml(formatTime(firstSeg.departing_at))}</strong>
        <span>${escapeHtml(slice.origin || "")}</span>
      </div>
      <span class="booking-flight-duration">${escapeHtml(slice.duration_label || "")}</span>
      <div class="booking-flight-endpoint">
        <strong>${escapeHtml(formatTime(lastSeg.arriving_at))}</strong>
        <span>${escapeHtml(slice.destination || "")}</span>
      </div>
    </div>
  `;

  // Passengers section — editable list with Add / Edit / Delete
  const paxSection = document.createElement("div");
  paxSection.className = "booking-section booking-passengers";
  if (status === "draft") {
    renderPassengerEditor(paxSection, booking);
  } else {
    renderPassengerReadOnly(paxSection, passengers);
  }

  // Fare breakdown section
  const fareSection = document.createElement("div");
  fareSection.className = "booking-section booking-fare";
  const fareLabel = document.createElement("p");
  fareLabel.className = "booking-section-label";
  fareLabel.textContent = "Fare breakdown";
  fareSection.appendChild(fareLabel);
  const fareRows = document.createElement("div");
  fareRows.className = "booking-fare-rows";
  fareRows.append(
    fareRow("Base fare", fare.base_amount, fare.currency),
    fareRow("Taxes & fees", fare.tax_amount, fare.currency)
  );
  const totalRow = document.createElement("div");
  totalRow.className = "booking-fare-row booking-fare-total";
  totalRow.innerHTML = `<span>Total</span><strong>${escapeHtml(formatFlightPrice(fare.total_amount, fare.currency))}</strong>`;
  fareRows.appendChild(totalRow);
  fareSection.appendChild(fareRows);

  // Conditions / what's included
  const conditions = document.createElement("div");
  conditions.className = "booking-conditions";
  const baggage = offer.baggage || { carry_on: 0, checked: 0 };
  const carry = baggage.carry_on > 0 ? `${baggage.carry_on} carry-on` : "Carry-on not included";
  const checked = baggage.checked > 0 ? `${baggage.checked} checked bag${baggage.checked > 1 ? "s" : ""}` : "No checked bag";
  const refund = offer.refundable === true ? "Refundable" : offer.refundable === false ? "Non-refundable" : "Refund policy varies";
  const change = offer.changeable === true ? "Changes allowed" : offer.changeable === false ? "Changes not allowed" : "";
  const conditionsText = [carry, checked, refund, change].filter(Boolean).join(" · ");
  conditions.innerHTML = `<span class="booking-conditions-label">Included</span> ${escapeHtml(conditionsText)}`;

  // JhaPay wallet panel
  const walletPanel = document.createElement("div");
  walletPanel.className = "wallet-panel";
  const walletBrand = document.createElement("div");
  walletBrand.className = "wallet-brand";
  walletBrand.innerHTML = `<span>JhaPay</span><small>Wallet</small>`;
  const walletNumbers = document.createElement("div");
  walletNumbers.className = "wallet-numbers";
  walletNumbers.append(
    walletMetric("Current balance", wallet.balance_before, "wallet-balance"),
    walletMetric("Ticket total", wallet.order_total ?? offer.total_amount, "wallet-total"),
    walletMetric("Remaining", wallet.remaining_after, "wallet-remaining")
  );
  walletPanel.append(walletBrand, walletNumbers);

  // Footer
  const footer = document.createElement("div");
  footer.className = "booking-card-footer";

  if (status === "draft") {
    const actions = document.createElement("div");
    actions.className = "booking-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "booking-cancel secondary-action";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => sendChatMessage("cancel"));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "booking-confirm";
    confirm.textContent = "Confirm & pay";
    const allValid = (booking.passengers || []).every(passengerIsValid);
    confirm.disabled = !allValid;
    confirm.title = allValid ? "" : "Fill name and date of birth for every passenger";
    confirm.addEventListener("click", () => {
      if (confirm.disabled) return;
      sendChatMessage("confirm");
    });
    actions.append(cancel, confirm);
    footer.appendChild(actions);
  } else if (status === "confirmed") {
    const eta = document.createElement("span");
    eta.className = "pickup-eta";
    eta.textContent = "Check-in opens 24 hours before departure. Itinerary sent to your email.";
    footer.appendChild(eta);
  } else if (status === "cancelled") {
    const note = document.createElement("span");
    note.className = "booking-cancelled-note";
    note.textContent = "No charge made.";
    footer.appendChild(note);
  }

  card.append(header, summary, paxSection, fareSection, conditions, walletPanel, footer);
  messages.appendChild(card);
  scrollIntoChatView(card);
}

function fareRow(label, amount, currency) {
  const row = document.createElement("div");
  row.className = "booking-fare-row";
  const span = document.createElement("span");
  span.textContent = label;
  const value = document.createElement("strong");
  value.textContent = formatFlightPrice(amount, currency);
  row.append(span, value);
  return row;
}

function passengerIsValid(p) {
  return Boolean(
    p
    && String(p.first_name || "").trim()
    && String(p.last_name || "").trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date_of_birth || "").trim())
  );
}

function renderPassengerReadOnly(section, passengers) {
  section.textContent = "";
  const heading = document.createElement("p");
  heading.className = "booking-section-label";
  heading.textContent = passengers.length > 1 ? `Passengers (${passengers.length})` : "Passenger";
  section.appendChild(heading);
  passengers.forEach((p) => {
    const row = document.createElement("div");
    row.className = "booking-passenger-row";
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Guest";
    const contact = p.email || p.phone || "";
    const dob = p.date_of_birth ? `DOB ${p.date_of_birth}` : "";
    row.innerHTML = `
      <div class="booking-passenger-main">
        <strong>${escapeHtml(fullName)}</strong>
        <span>${escapeHtml(dob)}${dob && contact ? " · " : ""}${escapeHtml(contact)}</span>
      </div>
    `;
    section.appendChild(row);
  });
}

function renderPassengerEditor(section, booking) {
  section.textContent = "";
  const passengers = booking.passengers || [];
  const heading = document.createElement("p");
  heading.className = "booking-section-label";
  heading.textContent = passengers.length > 1 ? `Passengers (${passengers.length})` : "Passenger";
  section.appendChild(heading);

  passengers.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "booking-passenger-row";
    row.dataset.passengerIndex = String(idx);
    const valid = passengerIsValid(p);
    row.classList.toggle("invalid", !valid);

    if (row.dataset.editing === "true") {
      // (editor mode handled by toggle below)
    }

    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || `Passenger ${idx + 1}`;
    const contact = p.email || p.phone || "";
    const dob = p.date_of_birth ? `DOB ${p.date_of_birth}` : "";
    const status = valid ? "" : "<span class=\"booking-passenger-warn\">Needs details</span>";

    const main = document.createElement("div");
    main.className = "booking-passenger-main";
    main.innerHTML = `
      <strong>${escapeHtml(fullName)}</strong>
      <span>${escapeHtml(dob)}${dob && contact ? " · " : ""}${escapeHtml(contact)}</span>
      ${status}
    `;

    const actions = document.createElement("div");
    actions.className = "booking-passenger-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "booking-passenger-edit";
    editBtn.textContent = valid ? "Edit" : "Fill in";
    editBtn.addEventListener("click", () => openPassengerForm(section, booking, idx));

    if (idx > 0) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "booking-passenger-delete";
      delBtn.setAttribute("aria-label", `Remove passenger ${idx + 1}`);
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", async () => {
        const next = booking.passengers.filter((_, i) => i !== idx);
        await savePassengers(section, booking, next);
      });
      actions.append(editBtn, delBtn);
    } else {
      actions.append(editBtn);
    }

    row.append(main, actions);
    section.appendChild(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "booking-passenger-add";
  add.textContent = "+ Add passenger";
  add.disabled = passengers.length >= 9;
  add.addEventListener("click", () => {
    const next = [...booking.passengers, { first_name: "", last_name: "", date_of_birth: "", email: "", phone: "", gender: "" }];
    savePassengers(section, booking, next).then(() => openPassengerForm(section, booking, next.length - 1));
  });
  section.appendChild(add);
}

function openPassengerForm(section, booking, idx) {
  const p = booking.passengers[idx] || {};
  const overlay = document.createElement("div");
  overlay.className = "booking-passenger-overlay";

  const form = document.createElement("form");
  form.className = "booking-passenger-form";
  form.innerHTML = `
    <h3>Passenger ${idx + 1}</h3>
    <label>First name<input type="text" name="first_name" value="${escapeHtml(p.first_name || "")}" required></label>
    <label>Last name<input type="text" name="last_name" value="${escapeHtml(p.last_name || "")}" required></label>
    <label>Date of birth<input type="date" name="date_of_birth" value="${escapeHtml(p.date_of_birth || "")}" required></label>
    <label>Email<input type="email" name="email" value="${escapeHtml(p.email || "")}"></label>
    <label>Phone<input type="tel" name="phone" value="${escapeHtml(p.phone || "")}"></label>
    <div class="booking-passenger-form-actions">
      <button type="button" class="booking-passenger-form-cancel">Cancel</button>
      <button type="submit" class="booking-passenger-form-save">Save</button>
    </div>
  `;

  overlay.appendChild(form);
  document.body.appendChild(overlay);

  form.querySelector(".booking-passenger-form-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const next = booking.passengers.map((existing, i) => i === idx ? { ...existing, ...data } : existing);
    overlay.remove();
    await savePassengers(section, booking, next);
  });
}

async function savePassengers(section, booking, nextPassengers) {
  try {
    ensureSessionId();
    const res = await fetch("/api/booking/passengers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, passengers: nextPassengers })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      addMessage("meta", payload.error || "Could not update passengers.");
      return;
    }
    const payload = await res.json();
    booking.passengers = payload.booking.passengers;
    booking.fare = payload.booking.fare;
    booking.jhapay_wallet = payload.booking.jhapay_wallet;
    refreshBookingCard(section, booking);
  } catch (error) {
    addMessage("meta", `Network error: ${error.message}`);
  }
}

function refreshBookingCard(paxSection, booking) {
  // Re-render the passengers panel
  renderPassengerEditor(paxSection, booking);
  // Re-render fare + wallet (find them in the parent card)
  const card = paxSection.closest(".booking-card");
  if (!card) return;
  const fareSection = card.querySelector(".booking-fare");
  if (fareSection) {
    const rows = fareSection.querySelector(".booking-fare-rows");
    if (rows) {
      rows.textContent = "";
      rows.append(
        fareRow("Base fare", booking.fare.base_amount, booking.fare.currency),
        fareRow("Taxes & fees", booking.fare.tax_amount, booking.fare.currency)
      );
      const total = document.createElement("div");
      total.className = "booking-fare-row booking-fare-total";
      total.innerHTML = `<span>Total (${booking.passengers.length} pax)</span><strong>${escapeHtml(formatFlightPrice(booking.fare.total_amount, booking.fare.currency))}</strong>`;
      rows.appendChild(total);
    }
  }
  const wallet = card.querySelector(".wallet-numbers");
  if (wallet) {
    wallet.textContent = "";
    const w = booking.jhapay_wallet;
    wallet.append(
      walletMetric("Current balance", w.balance_before, "wallet-balance"),
      walletMetric("Ticket total", w.order_total, "wallet-total"),
      walletMetric("Remaining", w.remaining_after, "wallet-remaining")
    );
  }
  // Enable/disable Confirm button
  const confirmBtn = card.querySelector(".booking-confirm");
  if (confirmBtn) {
    const allValid = booking.passengers.every(passengerIsValid);
    confirmBtn.disabled = !allValid;
    confirmBtn.title = allValid ? "" : "Fill name and date of birth for every passenger";
  }
}

function formatTime(iso) {
  if (!iso) return "—";
  // Duffel returns local naive times like "2026-06-24T17:48:00" — extract the HH:MM
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  if (!m) return "—";
  let h = Number(m[1]);
  const mm = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mm} ${ampm}`;
}

function formatFlightDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatFlightPrice(amount, currency) {
  if (amount === undefined || amount === null || amount === "") return "—";
  const n = Number(amount);
  const value = Number.isFinite(n) ? n.toFixed(2) : String(amount);
  const ccy = String(currency || "USD").toUpperCase();
  const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "CA$", AUD: "A$", JPY: "¥" };
  const symbol = SYMBOLS[ccy];
  return symbol ? `${symbol}${value}` : `${ccy} ${value}`;
}

// ─── Hotel Options ────────────────────────────────────────────────────────────

function addHotelOptions(hotels, slots) {
  const wrapper = document.createElement("div");
  wrapper.className = "hotel-options";

  if (slots) {
    const summary = document.createElement("div");
    summary.className = "hotel-summary";
    const dateRange = slots.checkIn && slots.checkOut
      ? `${formatFlightDate(slots.checkIn)} – ${formatFlightDate(slots.checkOut)}`
      : (slots.checkIn ? formatFlightDate(slots.checkIn) : "");
    const guests = `${slots.guests || 1} ${(slots.guests || 1) === 1 ? "guest" : "guests"}`;
    summary.innerHTML = `<strong>${escapeHtml(slots.city || "")}</strong><span>${escapeHtml(dateRange)} · ${escapeHtml(guests)}</span>`;
    wrapper.appendChild(summary);
  }

  hotels.slice(0, 6).forEach((hotel, index) => {
    wrapper.appendChild(buildHotelCard(hotel, index));
  });

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function buildHotelCard(hotel, index) {
  const card = document.createElement("article");
  card.className = "hotel-card";

  const rating = typeof hotel.rating === "number" ? hotel.rating.toFixed(1) : null;
  const reviewsCount = hotel.ratings_count ? ` (${formatThousands(hotel.ratings_count)})` : "";
  const priceLabel = formatFlightPrice(hotel.nightly_rate, hotel.currency);
  const totalLabel = formatFlightPrice(hotel.total, hotel.currency);
  const nights = hotel.nights || 1;
  const amenities = (hotel.amenities || []).slice(0, 3).join(" · ");

  const photoCount = (hotel.photo_urls || []).length;
  card.innerHTML = `
    <button type="button" class="hotel-card-photo" style="background-image: url('${escapeHtml(hotel.photo_url || "")}')" aria-label="View ${escapeHtml(hotel.name || "hotel")} photos">
      ${photoCount > 1 ? `<span class="hotel-card-photo-count">${photoCount} photos</span>` : ""}
    </button>
    <div class="hotel-card-body">
      <div class="hotel-card-head">
        <strong class="hotel-card-name">${escapeHtml(hotel.name || "Hotel")}</strong>
        ${rating ? `<span class="hotel-card-rating">★ ${escapeHtml(rating)}<small>${escapeHtml(reviewsCount)}</small></span>` : ""}
      </div>
      <p class="hotel-card-address">${escapeHtml(hotel.address || "")}</p>
      ${amenities ? `<p class="hotel-card-amenities">${escapeHtml(amenities)}</p>` : ""}
      <div class="hotel-card-foot">
        <div class="hotel-card-price">
          <strong>${escapeHtml(priceLabel)}</strong><span>/ night</span>
          <small>${escapeHtml(totalLabel)} total · ${nights} night${nights > 1 ? "s" : ""}</small>
        </div>
        <button type="button" class="hotel-card-select">Select <span aria-hidden="true">→</span></button>
      </div>
    </div>
  `;

  const photoBtn = card.querySelector(".hotel-card-photo");
  photoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openHotelGallery(hotel);
  });

  const select = card.querySelector(".hotel-card-select");
  select.addEventListener("click", () => {
    const wrapper = card.parentElement;
    if (wrapper) {
      wrapper.querySelectorAll(".hotel-card").forEach((sibling) => {
        sibling.classList.toggle("hotel-card-selected", sibling === card);
        sibling.classList.toggle("hotel-card-dimmed", sibling !== card);
        const sBtn = sibling.querySelector(".hotel-card-select");
        if (sBtn) sBtn.disabled = true;
      });
      select.textContent = "Selected";
    }
    messageInput.value = `book hotel ${index + 1}`;
    if (typeof chatForm.requestSubmit === "function") chatForm.requestSubmit();
    else chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  return card;
}

function formatThousands(n) {
  return Number(n).toLocaleString("en-US");
}

// ─── Hotel Photo Gallery (Lightbox) ───────────────────────────────────────────

function openHotelGallery(hotel) {
  const urls = (hotel.photo_urls && hotel.photo_urls.length) ? hotel.photo_urls : [hotel.photo_url].filter(Boolean);
  if (urls.length === 0) return;

  const overlay = document.createElement("div");
  overlay.className = "hotel-gallery-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${hotel.name || "Hotel"} photos`);

  // Header: hotel name + counter + close
  const header = document.createElement("div");
  header.className = "hotel-gallery-header";
  header.innerHTML = `
    <div class="hotel-gallery-title">
      <strong>${escapeHtml(hotel.name || "Hotel")}</strong>
      <span class="hotel-gallery-counter">1 / ${urls.length}</span>
    </div>
    <button type="button" class="hotel-gallery-close" aria-label="Close">×</button>
  `;

  // Carousel: horizontal scroll-snap strip
  const strip = document.createElement("div");
  strip.className = "hotel-gallery-strip";
  urls.forEach((url, i) => {
    const slide = document.createElement("div");
    slide.className = "hotel-gallery-slide";
    slide.dataset.index = String(i);
    const img = document.createElement("img");
    img.src = url;
    img.alt = `${hotel.name || "Hotel"} photo ${i + 1}`;
    img.loading = i === 0 ? "eager" : "lazy";
    slide.appendChild(img);
    strip.appendChild(slide);
  });

  // Navigation arrows (desktop)
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "hotel-gallery-arrow hotel-gallery-arrow-prev";
  prevBtn.setAttribute("aria-label", "Previous photo");
  prevBtn.textContent = "‹";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "hotel-gallery-arrow hotel-gallery-arrow-next";
  nextBtn.setAttribute("aria-label", "Next photo");
  nextBtn.textContent = "›";

  overlay.append(header, strip, prevBtn, nextBtn);
  document.body.appendChild(overlay);
  document.body.classList.add("gallery-open");

  const counter = header.querySelector(".hotel-gallery-counter");

  // Update counter based on scroll position
  function updateCounter() {
    const slideWidth = strip.clientWidth;
    if (slideWidth === 0) return;
    const idx = Math.round(strip.scrollLeft / slideWidth);
    const clamped = Math.max(0, Math.min(urls.length - 1, idx));
    counter.textContent = `${clamped + 1} / ${urls.length}`;
  }
  strip.addEventListener("scroll", updateCounter, { passive: true });

  function scrollBy(direction) {
    const slideWidth = strip.clientWidth;
    strip.scrollBy({ left: slideWidth * direction, behavior: "smooth" });
  }
  prevBtn.addEventListener("click", () => scrollBy(-1));
  nextBtn.addEventListener("click", () => scrollBy(1));

  function close() {
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("gallery-open");
    overlay.remove();
  }
  header.querySelector(".hotel-gallery-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") scrollBy(-1);
    else if (e.key === "ArrowRight") scrollBy(1);
  }
  document.addEventListener("keydown", onKey);
}

// ─── Hotel Booking Card ───────────────────────────────────────────────────────

function addHotelBookingCard(booking, intent) {
  const hotel = booking.hotel || {};
  const wallet = booking.jhapay_wallet || {};
  const guests = booking.guests || hotel.guests || 1;
  const nights = hotel.nights || 1;
  const checkIn = booking.check_in || "";
  const checkOut = booking.check_out || "";
  const status = intent === "hotel_booking_confirmed"
    ? "confirmed"
    : intent === "hotel_booking_cancelled"
      ? "cancelled"
      : "draft";

  const card = document.createElement("article");
  card.className = "booking-card hotel-booking-card";

  // Header
  const header = document.createElement("div");
  header.className = "booking-card-header";
  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = status === "confirmed"
    ? "Confirmed hotel booking"
    : status === "cancelled"
      ? "Cancelled draft"
      : "Draft hotel booking";
  titleBlock.appendChild(title);
  if (status === "confirmed" && booking.reservation_id) {
    const ref = document.createElement("strong");
    ref.className = "booking-pnr";
    ref.textContent = `Reservation ${booking.reservation_id}`;
    titleBlock.appendChild(ref);
  }
  const route = document.createElement("p");
  route.className = "booking-route-line";
  route.textContent = `${hotel.name || "Hotel"} · ${hotel.city || ""}`;
  titleBlock.appendChild(route);

  const statusBadge = document.createElement("span");
  statusBadge.className = `order-status ${status}`;
  statusBadge.textContent = status;
  header.append(titleBlock, statusBadge);

  // Photo + key facts
  const summary = document.createElement("div");
  summary.className = "hotel-booking-summary";
  const ratingStr = typeof hotel.rating === "number" ? `★ ${hotel.rating.toFixed(1)}` : "";
  const bookingPhotoCount = (hotel.photo_urls || []).length;
  summary.innerHTML = `
    <button type="button" class="hotel-booking-photo" style="background-image: url('${escapeHtml(hotel.photo_url || "")}')" aria-label="View hotel photos">
      ${bookingPhotoCount > 1 ? `<span class="hotel-card-photo-count">${bookingPhotoCount} photos</span>` : ""}
    </button>
    <div class="hotel-booking-info">
      <p class="hotel-booking-rating">${escapeHtml(ratingStr)}</p>
      <p class="hotel-booking-address">${escapeHtml(hotel.address || "")}</p>
      <div class="hotel-booking-stay">
        <div><span>Check-in</span><strong>${escapeHtml(formatFlightDate(checkIn))}</strong></div>
        <div><span>Check-out</span><strong>${escapeHtml(formatFlightDate(checkOut))}</strong></div>
        <div><span>Guests</span><strong>${guests}</strong></div>
        <div><span>Nights</span><strong>${nights}</strong></div>
      </div>
    </div>
  `;
  summary.querySelector(".hotel-booking-photo").addEventListener("click", (e) => {
    e.stopPropagation();
    openHotelGallery(hotel);
  });

  // Fare breakdown
  const fareSection = document.createElement("div");
  fareSection.className = "booking-section booking-fare";
  fareSection.innerHTML = `
    <p class="booking-section-label">Stay total</p>
    <div class="booking-fare-rows">
      <div class="booking-fare-row"><span>${escapeHtml(`${formatFlightPrice(hotel.nightly_rate, hotel.currency)} × ${nights} night${nights > 1 ? "s" : ""}`)}</span><strong>${escapeHtml(formatFlightPrice(hotel.subtotal, hotel.currency))}</strong></div>
      <div class="booking-fare-row"><span>Taxes & fees</span><strong>${escapeHtml(formatFlightPrice(hotel.taxes, hotel.currency))}</strong></div>
      <div class="booking-fare-row booking-fare-total"><span>Total</span><strong>${escapeHtml(formatFlightPrice(hotel.total, hotel.currency))}</strong></div>
    </div>
  `;

  // Conditions
  const amenities = (hotel.amenities || []).join(" · ");
  const conditions = document.createElement("div");
  conditions.className = "booking-conditions";
  conditions.innerHTML = `<span class="booking-conditions-label">Includes</span> ${escapeHtml(amenities)} · ${escapeHtml(hotel.cancellation || "")}`;

  // Wallet panel
  const walletPanel = document.createElement("div");
  walletPanel.className = "wallet-panel";
  const walletBrand = document.createElement("div");
  walletBrand.className = "wallet-brand";
  walletBrand.innerHTML = `<span>JhaPay</span><small>Wallet</small>`;
  const walletNumbers = document.createElement("div");
  walletNumbers.className = "wallet-numbers";
  walletNumbers.append(
    walletMetric("Current balance", wallet.balance_before, "wallet-balance"),
    walletMetric("Stay total", wallet.order_total ?? hotel.total, "wallet-total"),
    walletMetric("Remaining", wallet.remaining_after, "wallet-remaining")
  );
  walletPanel.append(walletBrand, walletNumbers);

  // Footer
  const footer = document.createElement("div");
  footer.className = "booking-card-footer";
  if (status === "draft") {
    const actions = document.createElement("div");
    actions.className = "booking-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "booking-cancel secondary-action";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => sendChatMessage("cancel"));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "booking-confirm";
    confirm.textContent = "Confirm & pay";
    confirm.addEventListener("click", () => sendChatMessage("confirm"));
    actions.append(cancel, confirm);
    footer.appendChild(actions);
  } else if (status === "confirmed") {
    const eta = document.createElement("span");
    eta.className = "pickup-eta";
    eta.textContent = `Check-in opens at 3 PM on ${formatFlightDate(checkIn)}. Confirmation email on its way.`;
    footer.appendChild(eta);
  } else if (status === "cancelled") {
    const note = document.createElement("span");
    note.className = "booking-cancelled-note";
    note.textContent = "No charge made.";
    footer.appendChild(note);
  }

  card.append(header, summary, fareSection, conditions, walletPanel, footer);
  messages.appendChild(card);
  scrollIntoChatView(card);
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
