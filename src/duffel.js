// Duffel sandbox client. Wraps the offer-request flow for flight search.
// Production switch is a token swap — duffel_test_* → duffel_live_*.

const DUFFEL_BASE_URL = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function duffelHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Duffel-Version": DUFFEL_VERSION,
    Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`
  };
}

function isConfigured() {
  return Boolean(process.env.DUFFEL_ACCESS_TOKEN);
}

async function searchFlights({
  origin,
  destination,
  departDate,
  returnDate = null,
  passengers = 1,
  cabinClass = "economy"
}) {
  if (!isConfigured()) {
    return { offers: [], error: "DUFFEL_ACCESS_TOKEN is not set" };
  }

  const slices = [{ origin, destination, departure_date: departDate }];
  if (returnDate) {
    slices.push({ origin: destination, destination: origin, departure_date: returnDate });
  }

  const passengerList = [];
  for (let i = 0; i < Math.max(1, Math.min(9, Number(passengers) || 1)); i += 1) {
    passengerList.push({ type: "adult" });
  }

  const body = {
    data: {
      slices,
      passengers: passengerList,
      cabin_class: cabinClass
    }
  };

  const url = `${DUFFEL_BASE_URL}/air/offer_requests?return_offers=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: duffelHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      offers: [],
      error: `Duffel ${response.status}: ${detail.slice(0, 600)}`
    };
  }

  const payload = await response.json();
  const rawOffers = payload?.data?.offers || [];
  const offers = rawOffers.map(summarizeOffer).filter(Boolean);
  return {
    offerRequestId: payload?.data?.id,
    offers
  };
}

function summarizeOffer(offer) {
  if (!offer || !Array.isArray(offer.slices) || offer.slices.length === 0) return null;
  const conditions = offer.conditions || {};
  const refundable = conditions.refund_before_departure?.allowed ?? null;
  const changeable = conditions.change_before_departure?.allowed ?? null;
  const passenger0 = offer.passengers?.[0] || {};
  const baggages = passenger0.baggages || [];
  return {
    id: offer.id,
    total_amount: offer.total_amount,
    total_currency: offer.total_currency,
    base_amount: offer.base_amount || null,
    base_currency: offer.base_currency || offer.total_currency,
    tax_amount: offer.tax_amount || null,
    tax_currency: offer.tax_currency || offer.total_currency,
    expires_at: offer.expires_at,
    cabin_class: passenger0.cabin_class || "economy",
    cabin_class_marketing_name: passenger0.cabin_class_marketing_name || "",
    refundable,
    changeable,
    total_emissions_kg: offer.total_emissions_kg ? Number(offer.total_emissions_kg) : null,
    baggage: {
      carry_on: baggages.filter((b) => b.type === "carry_on").reduce((s, b) => s + (b.quantity || 0), 0),
      checked: baggages.filter((b) => b.type === "checked").reduce((s, b) => s + (b.quantity || 0), 0)
    },
    airline: {
      iata_code: offer.owner?.iata_code || "",
      name: offer.owner?.name || ""
    },
    slices: offer.slices.map(summarizeSlice)
  };
}

function summarizeSlice(slice) {
  const segments = Array.isArray(slice.segments) ? slice.segments : [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};
  return {
    origin: slice.origin?.iata_code || first.origin?.iata_code || "",
    origin_city: slice.origin?.city_name || first.origin?.city_name || "",
    destination: slice.destination?.iata_code || last.destination?.iata_code || "",
    destination_city: slice.destination?.city_name || last.destination?.city_name || "",
    duration: slice.duration || "", // ISO 8601 PTxHyM
    duration_label: formatIsoDuration(slice.duration),
    stops: Math.max(0, segments.length - 1),
    departing_at: first.departing_at || "",
    arriving_at: last.arriving_at || "",
    segments: segments.map((seg) => ({
      flight_number: `${seg.marketing_carrier?.iata_code || ""}${seg.marketing_carrier_flight_number || ""}`,
      carrier_name: seg.marketing_carrier?.name || "",
      origin: seg.origin?.iata_code || "",
      destination: seg.destination?.iata_code || "",
      departing_at: seg.departing_at || "",
      arriving_at: seg.arriving_at || ""
    }))
  };
}

function formatIsoDuration(iso) {
  if (!iso || typeof iso !== "string") return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return "";
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return "";
}

module.exports = { searchFlights, isConfigured };
