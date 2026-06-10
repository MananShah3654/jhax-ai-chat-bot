// Google Places API (New) client — used for hotel discovery (lodging).
// Real names, addresses, ratings, photos from Google. Pricing is simulated
// because Places doesn't return prices; live booking would need a hotel API
// (Booking Affiliate, Liteapi, Hotelbeds). For demo, simulation is fine.

const PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.location",
  "places.photos",
  "places.websiteUri",
  "places.types"
].join(",");

function isConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function placesHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
    "X-Goog-FieldMask": FIELD_MASK
  };
}

async function searchHotels({ city, checkIn = null, checkOut = null, guests = 1, limit = 8 }) {
  if (!isConfigured()) {
    return { hotels: [], error: "GOOGLE_PLACES_API_KEY is not set" };
  }
  if (!city) {
    return { hotels: [], error: "City is required for hotel search." };
  }

  const body = {
    textQuery: `hotels in ${city}`,
    includedType: "lodging",
    maxResultCount: Math.max(1, Math.min(20, limit))
  };

  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: placesHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      hotels: [],
      error: `Google Places ${response.status}: ${detail.slice(0, 400)}`
    };
  }

  const payload = await response.json();
  const places = Array.isArray(payload?.places) ? payload.places : [];
  const nights = nightsBetween(checkIn, checkOut);
  const hotels = places.slice(0, limit).map((p) => summarizePlace(p, { city, nights, guests }));
  return { hotels, nights };
}

function summarizePlace(place, { city, nights, guests }) {
  const placeId = place.id || "";
  const displayName = place.displayName?.text || "Hotel";
  const rating = typeof place.rating === "number" ? place.rating : null;
  const ratingsCount = place.userRatingCount || 0;
  const priceLevel = priceLevelToNumber(place.priceLevel);
  const photoRefs = Array.isArray(place.photos)
    ? place.photos.map((p) => p?.name).filter(Boolean)
    : [];
  const photoUrls = photoRefs.length
    ? photoRefs.slice(0, 10).map((ref) => buildPhotoUrl(ref, 1200))
    : [fallbackPhoto(placeId)];
  const photoUrl = photoUrls[0]; // backward-compat for any consumer using single
  const perNight = simulateNightlyRate({ city, displayName, rating, priceLevel, placeId });
  const totalNights = Math.max(1, nights || 1);
  const subtotal = round(perNight * totalNights);
  const taxes = round(subtotal * 0.13);
  const total = round(subtotal + taxes);

  return {
    id: placeId,
    name: displayName,
    address: place.formattedAddress || "",
    city,
    rating,
    ratings_count: ratingsCount,
    price_level: priceLevel,
    photo_url: photoUrl,
    photo_urls: photoUrls,
    location: place.location || null,
    website: place.websiteUri || null,
    nightly_rate: perNight,
    nights: totalNights,
    subtotal,
    taxes,
    total,
    currency: "USD",
    guests,
    amenities: simulateAmenities(priceLevel, rating),
    cancellation: rating && rating >= 4 ? "Free cancellation until 24h before check-in" : "Non-refundable"
  };
}

function priceLevelToNumber(level) {
  // Google Places (New) returns string enums like "PRICE_LEVEL_MODERATE".
  if (typeof level === "number") return level;
  if (typeof level !== "string") return null;
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4
  };
  return level in map ? map[level] : null;
}

function buildPhotoUrl(photoName, maxWidth) {
  return `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
}

function fallbackPhoto(seed) {
  // Stable per-hotel fallback so the same hotel always gets the same image.
  const hash = stringHash(seed || "hotel");
  const idx = (hash % 8) + 1;
  const ids = [
    "photo-1455587734955-081b22074882",
    "photo-1542314831-068cd1dbfeeb",
    "photo-1566073771259-6a8506099945",
    "photo-1551882547-ff40c63fe5fa",
    "photo-1611892440504-42a792e24d32",
    "photo-1571896349842-33c89424de2d",
    "photo-1564501049412-61c2a3083791",
    "photo-1520250497591-112f2f40a3f4"
  ];
  return `https://images.unsplash.com/${ids[idx - 1]}?auto=format&fit=crop&w=800&q=80`;
}

function simulateNightlyRate({ city, displayName, rating, priceLevel, placeId }) {
  // Base by city
  const cityBase = {
    "new york": 280, "nyc": 280, "manhattan": 320,
    "san francisco": 260, "sf": 260,
    "los angeles": 220, "la": 220, "hollywood": 260, "beverly hills": 360,
    "chicago": 190,
    "miami": 240, "miami beach": 290,
    "boston": 230,
    "seattle": 210,
    "washington": 220, "dc": 220, "washington dc": 220,
    "las vegas": 130, "vegas": 130,
    "orlando": 160,
    "austin": 180,
    "nashville": 200,
    "portland": 180,
    "san diego": 220,
    "denver": 190,
    "phoenix": 170,
    "atlanta": 170,
    "houston": 160,
    "dallas": 170,
    "philadelphia": 180,
    "honolulu": 320
  };
  const base = cityBase[String(city || "").toLowerCase()] || 180;

  // Price-level multiplier (Places-provided)
  const priceMult = priceLevel == null
    ? 1.0
    : [0.6, 0.85, 1.0, 1.25, 1.6][Math.max(0, Math.min(4, priceLevel))];

  // Rating bump
  const ratingBump = rating ? (rating - 4.0) * 35 : 0;

  // Deterministic per-hotel variance ±20%
  const hash = stringHash(placeId || displayName);
  const variance = ((hash % 41) - 20) / 100; // -0.20..0.20

  const computed = base * priceMult * (1 + variance) + ratingBump;
  return round(Math.max(45, computed));
}

function simulateAmenities(priceLevel, rating) {
  const amenities = ["Free WiFi"];
  if (rating && rating >= 4.0) amenities.push("Air conditioning");
  if (priceLevel >= 2 || (rating && rating >= 4.2)) amenities.push("Free breakfast");
  if (priceLevel >= 2) amenities.push("Fitness center");
  if (priceLevel >= 3 || (rating && rating >= 4.5)) amenities.push("Pool");
  if (priceLevel >= 3) amenities.push("Room service");
  if (priceLevel >= 4) amenities.push("Concierge");
  return amenities;
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const a = new Date(`${checkIn}T00:00:00Z`);
  const b = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diffMs = b.getTime() - a.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function stringHash(s) {
  const text = String(s || "");
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

module.exports = { searchHotels, isConfigured };
