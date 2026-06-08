// Travel slot extraction: natural language → { origin, destination, departDate, returnDate, passengers, cabinClass }.
// Pure functions, no I/O. Today's date is injected so unit tests stay deterministic.

const US_CITY_TO_IATA = new Map([
  ["nyc", "JFK"], ["new york", "JFK"], ["new york city", "JFK"], ["jfk", "JFK"], ["lga", "LGA"], ["laguardia", "LGA"], ["newark", "EWR"], ["ewr", "EWR"],
  ["la", "LAX"], ["los angeles", "LAX"], ["lax", "LAX"],
  ["sf", "SFO"], ["san francisco", "SFO"], ["sfo", "SFO"],
  ["chicago", "ORD"], ["ord", "ORD"], ["midway", "MDW"],
  ["dallas", "DFW"], ["dfw", "DFW"],
  ["houston", "IAH"], ["iah", "IAH"],
  ["miami", "MIA"], ["mia", "MIA"], ["fort lauderdale", "FLL"], ["fll", "FLL"],
  ["boston", "BOS"], ["bos", "BOS"],
  ["seattle", "SEA"], ["sea", "SEA"],
  ["denver", "DEN"], ["den", "DEN"],
  ["atlanta", "ATL"], ["atl", "ATL"],
  ["las vegas", "LAS"], ["vegas", "LAS"], ["las", "LAS"],
  ["washington", "DCA"], ["dc", "DCA"], ["dca", "DCA"], ["dulles", "IAD"], ["iad", "IAD"],
  ["phoenix", "PHX"], ["phx", "PHX"],
  ["philadelphia", "PHL"], ["philly", "PHL"], ["phl", "PHL"],
  ["detroit", "DTW"], ["dtw", "DTW"],
  ["orlando", "MCO"], ["mco", "MCO"],
  ["austin", "AUS"], ["aus", "AUS"],
  ["portland", "PDX"], ["pdx", "PDX"],
  ["nashville", "BNA"], ["bna", "BNA"],
  ["minneapolis", "MSP"], ["msp", "MSP"],
  ["tampa", "TPA"], ["tpa", "TPA"],
  ["san diego", "SAN"], ["san", "SAN"],
  ["charlotte", "CLT"], ["clt", "CLT"],
  ["baltimore", "BWI"], ["bwi", "BWI"],
  ["salt lake", "SLC"], ["salt lake city", "SLC"], ["slc", "SLC"],
  ["honolulu", "HNL"], ["hnl", "HNL"]
]);

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function todayIso(today = new Date()) {
  return today.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(message, today = new Date()) {
  const text = String(message || "").toLowerCase();
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (/\btoday\b/.test(text)) return toIso(t);
  if (/\b(day\s+after\s+tomorrow|the\s+day\s+after\s+tomorrow)\b/.test(text)) return toIso(addDays(t, 2));
  if (/\btomorrow\b/.test(text)) return toIso(addDays(t, 1));
  if (/\bthis\s+weekend\b/.test(text)) {
    const dow = t.getUTCDay();
    const daysUntilSat = (6 - dow + 7) % 7 || 7;
    return toIso(addDays(t, daysUntilSat));
  }
  const inN = text.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inN) return toIso(addDays(t, Number(inN[1])));

  // "next Friday" → the Friday in the upcoming week
  for (let i = 0; i < 7; i += 1) {
    const w = WEEKDAYS[i];
    const re = new RegExp(`\\bnext\\s+${w}\\b`);
    if (re.test(text)) {
      const dow = t.getUTCDay();
      const days = ((i - dow + 7) % 7) || 7;
      return toIso(addDays(t, days + 7 * Number(((i - dow + 7) % 7) === 0)));
    }
  }
  // "this Friday" → upcoming Friday this week (or next if past)
  for (let i = 0; i < 7; i += 1) {
    const w = WEEKDAYS[i];
    const re = new RegExp(`\\b(this|on)\\s+${w}\\b`);
    if (re.test(text)) {
      const dow = t.getUTCDay();
      const days = ((i - dow + 7) % 7) || 7;
      return toIso(addDays(t, days));
    }
  }

  // ISO date: 2026-06-24
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Month name + day: "june 24", "jun 24th", "june 24 th"
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthAbbr = ["jan","feb","mar","apr","may","jun","jul","aug","sep","sept","oct","nov","dec"];
  const monthDay = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*(?:st|nd|rd|th))?\b/);
  if (monthDay) {
    const monthKey = monthDay[1].slice(0, 3);
    let monthIdx = months.findIndex((m) => m.startsWith(monthKey));
    if (monthIdx === -1) monthIdx = monthAbbr.indexOf(monthKey);
    if (monthIdx >= 0) {
      const day = Number(monthDay[2]);
      const year = t.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, monthIdx, day));
      if (candidate >= t) return toIso(candidate);
      return toIso(new Date(Date.UTC(year + 1, monthIdx, day)));
    }
  }

  // Day + month: "23 june", "23rd jun", "24 th june" (Indian / British order, with detached ordinal)
  const dayMonth = text.match(/\b(\d{1,2})(?:\s*(?:st|nd|rd|th))?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (dayMonth) {
    const monthKey = dayMonth[2].slice(0, 3);
    let monthIdx = months.findIndex((m) => m.startsWith(monthKey));
    if (monthIdx === -1) monthIdx = monthAbbr.indexOf(monthKey);
    if (monthIdx >= 0) {
      const day = Number(dayMonth[1]);
      const year = t.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, monthIdx, day));
      if (candidate >= t) return toIso(candidate);
      return toIso(new Date(Date.UTC(year + 1, monthIdx, day)));
    }
  }

  // Numeric date: MM/DD or DD/MM — disambiguate by value (>12 must be day)
  const numeric = text.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    let month;
    let day;
    if (a > 12 && b <= 12) { day = a; month = b; }       // DD/MM unambiguous
    else if (b > 12 && a <= 12) { day = b; month = a; }  // MM/DD unambiguous
    else { month = a; day = b; }                          // default American MM/DD
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = t.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate >= t) return toIso(candidate);
      return toIso(new Date(Date.UTC(year + 1, month - 1, day)));
    }
  }

  return null;
}

function findIataFromText(text) {
  // Match all 3-letter words (case-insensitive), then keep only ones that
  // resolve to a known airport. Filters out "for", "the", "you", etc.
  const candidates = [...String(text).toLowerCase().matchAll(/\b([a-z]{3})\b/g)].map((m) => m[1]);
  const seen = new Set();
  const valid = [];
  for (const c of candidates) {
    const resolved = US_CITY_TO_IATA.get(c);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      valid.push(resolved);
    }
  }
  return valid;
}

function resolveCityToIata(cityText) {
  if (!cityText) return null;
  const cleaned = String(cityText).toLowerCase().trim().replace(/[.,!?]+$/, "");
  if (US_CITY_TO_IATA.has(cleaned)) return US_CITY_TO_IATA.get(cleaned);
  const words = cleaned.split(/\s+/).filter(Boolean);
  // Try progressively shorter prefixes — handles "los angeles area" → "los angeles"
  for (let len = words.length; len >= 1; len -= 1) {
    const candidate = words.slice(0, len).join(" ");
    if (US_CITY_TO_IATA.has(candidate)) return US_CITY_TO_IATA.get(candidate);
  }
  // Try progressively shorter suffixes — handles "flights for la" → "la"
  for (let start = 1; start < words.length; start += 1) {
    const candidate = words.slice(start).join(" ");
    if (US_CITY_TO_IATA.has(candidate)) return US_CITY_TO_IATA.get(candidate);
  }
  // Try every single word in isolation — handles "i want vegas" → "vegas"
  for (const w of words) {
    if (US_CITY_TO_IATA.has(w)) return US_CITY_TO_IATA.get(w);
  }
  return null;
}

function extractFlightSlots(message, today = new Date()) {
  const text = String(message || "");
  let origin = null;
  let destination = null;

  // Pattern 1: "from X to Y"
  const fromTo = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]*?)\s+to\s+([A-Za-z][A-Za-z\s.]*?)(?:\s+on\b|\s+for\b|\s+next\b|\s+this\b|\s+tomorrow\b|\s+today\b|\s+in\s+\d|\s+\d|[.,!?]|$)/i);
  if (fromTo) {
    origin = resolveCityToIata(fromTo[1]);
    destination = resolveCityToIata(fromTo[2]);
  }

  // Pattern 2: "to X from Y"
  if (!origin || !destination) {
    const toFrom = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]*?)\s+from\s+([A-Za-z][A-Za-z\s.]*?)(?:\s+on\b|\s+for\b|\s+next\b|\s+this\b|\s+tomorrow\b|\s+today\b|\s+in\s+\d|\s+\d|[.,!?]|$)/i);
    if (toFrom) {
      destination = destination || resolveCityToIata(toFrom[1]);
      origin = origin || resolveCityToIata(toFrom[2]);
    }
  }

  // Pattern 3: "fly to X" / "flight to X" with no origin
  if (!destination) {
    const flyTo = text.match(/\b(?:fly(?:ing)?|flight|flights|going|travel(?:ing)?|trip)\s+to\s+([A-Za-z][A-Za-z\s.]*?)(?:\s+on\b|\s+for\b|\s+next\b|\s+this\b|\s+tomorrow\b|\s+today\b|\s+in\s+\d|\s+\d|[.,!?]|$)/i);
    if (flyTo) destination = resolveCityToIata(flyTo[1]);
  }

  // Pattern 4: Direct IATA codes "JFK to LAX" (case-insensitive)
  if (!origin || !destination) {
    const iata = text.match(/\b([a-z]{3})\s+to\s+([a-z]{3})\b/i);
    if (iata) {
      const a = US_CITY_TO_IATA.get(iata[1].toLowerCase());
      const b = US_CITY_TO_IATA.get(iata[2].toLowerCase());
      if (a) origin = origin || a;
      if (b) destination = destination || b;
    }
  }

  // Pattern 4b: Generic "X to Y" — handles city names without "from"/"fly to"
  // Examples: "lax to jfk flight", "los angeles to new york", "boston to miami tomorrow"
  if (!origin || !destination) {
    const xToY = text.match(/\b([A-Za-z][A-Za-z\s]*?)\s+to\s+([A-Za-z][A-Za-z\s]*?)(?:\s+(?:on|for|next|this|tomorrow|today|in|flight|flights)\b|\s+\d|[.,!?]|$)/i);
    if (xToY) {
      const a = resolveCityToIata(xToY[1].trim());
      const b = resolveCityToIata(xToY[2].trim());
      if (a) origin = origin || a;
      if (b) destination = destination || b;
    }
  }

  // Pattern 5: Any IATA codes mentioned, first→origin, second→destination
  if (!origin || !destination) {
    const codes = findIataFromText(text);
    if (codes.length >= 2) {
      origin = origin || codes[0];
      destination = destination || codes[1];
    } else if (codes.length === 1) {
      destination = destination || codes[0];
    }
  }

  // Pattern 6: standalone "from X" (e.g., slot-fill continuation: "from los angeles")
  if (!origin) {
    const fromOnly = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]+?)(?:\s+(?:on|for|next|this|tomorrow|today|in|to)\b|\s+\d|[.,!?]|$)/i);
    if (fromOnly) {
      const o = resolveCityToIata(fromOnly[1].trim());
      if (o) origin = o;
    }
  }

  // Pattern 7: standalone "to X" (e.g., slot-fill continuation: "to seattle")
  if (!destination) {
    const toOnly = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]+?)(?:\s+(?:on|for|next|this|tomorrow|today|in|from)\b|\s+\d|[.,!?]|$)/i);
    if (toOnly) {
      const d = resolveCityToIata(toOnly[1].trim());
      if (d) destination = d;
    }
  }

  const departDate = parseDate(text, today);

  // Passenger count — only match when the number is clearly about people.
  // "for 23 june" must NOT be parsed as 23 passengers.
  let passengers = 1;
  const pax = text.match(/\b(\d+)\s+(?:people|adults?|passengers?|travelers?|pax|tickets?)\b/i)
           || text.match(/\bfor\s+(\d+)\s+(?:people|adults?|passengers?|travelers?|pax|of\s+us)\b/i);
  if (pax) passengers = Math.max(1, Math.min(9, Number(pax[1])));

  // Cabin class
  let cabinClass = "economy";
  if (/\bbusiness\s+class\b/i.test(text)) cabinClass = "business";
  else if (/\bfirst\s+class\b/i.test(text)) cabinClass = "first";
  else if (/\bpremium\s+economy\b/i.test(text)) cabinClass = "premium_economy";

  const missing = [];
  if (!origin) missing.push("origin");
  if (!destination) missing.push("destination");
  if (!departDate) missing.push("depart_date");

  return { origin, destination, departDate, passengers, cabinClass, missing };
}

module.exports = {
  parseDate,
  resolveCityToIata,
  findIataFromText,
  extractFlightSlots,
  todayIso
};
