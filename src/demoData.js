const restaurants = [
  {
    id: "r_hesperia",
    name: "Olympic Flame Burgers - Hesperia",
    address: "16304 Main St",
    city: "Hesperia",
    state: "CA",
    postal_code: "92345",
    phone: "(760) 244-1992",
    timezone: "America/Los_Angeles",
    is_demo: false,
    image_url: locationImage("hesperia"),
    hours: { sun_thu: "6:00am-9:00pm", fri_sat: "6:00am-10:00pm" }
  },
  {
    id: "r_torrance",
    name: "Olympic Flame Burgers - Torrance",
    address: "20720 Normandie Ave",
    city: "Torrance",
    state: "CA",
    postal_code: "90502",
    phone: "(310) 532-0195",
    timezone: "America/Los_Angeles",
    is_demo: false,
    image_url: locationImage("torrance"),
    hours: { sun_thu: "6:00am-9:00pm", fri_sat: "6:00am-10:00pm" }
  },
  {
    id: "r_colton",
    name: "Olympic Flame Burgers - Colton",
    address: "1609 W Valley Blvd",
    city: "Colton",
    state: "CA",
    postal_code: "92324",
    phone: "(909) 572-6221",
    timezone: "America/Los_Angeles",
    is_demo: false,
    image_url: locationImage("colton"),
    hours: { sun_thu: "6:00am-9:00pm", fri_sat: "6:00am-10:00pm" }
  },
  ...[
    ["r_anaheim", "Anaheim Demo", "510 Harbor Blvd", "Anaheim", "92805", "(714) 555-0181", "anaheim"],
    ["r_riverside", "Riverside Demo", "290 Market St", "Riverside", "92501", "(951) 555-0144", "riverside"],
    ["r_pasadena", "Pasadena Demo", "88 Colorado Blvd", "Pasadena", "91101", "(626) 555-0177", "pasadena"],
    ["r_long_beach", "Long Beach Demo", "412 Ocean Blvd", "Long Beach", "90802", "(562) 555-0108", "longBeach"],
    ["r_irvine", "Irvine Demo", "38 Jamboree Rd", "Irvine", "92602", "(949) 555-0129", "irvine"],
    ["r_ontario", "Ontario Demo", "330 Euclid Ave", "Ontario", "91762", "(909) 555-0162", "ontario"],
    ["r_san_diego", "San Diego Demo", "701 Market St", "San Diego", "92101", "(619) 555-0190", "sanDiego"]
  ].map(([id, branch, address, city, postalCode, phone, imageKey]) => ({
    id,
    name: `Olympic Flame Burgers - ${branch}`,
    address,
    city,
    state: "CA",
    postal_code: postalCode,
    phone,
    timezone: "America/Los_Angeles",
    is_demo: true,
    image_url: locationImage(imageKey),
    hours: { sun_thu: "6:00am-9:00pm", fri_sat: "6:00am-10:00pm" }
  }))
];

const menuItems = [
  item("m_breakfast_burrito", "Breakfast Specials", "Breakfast Burrito with Meat", "Three eggs with bacon, sausage, hash browns, and cheese.", 12.49, ["breakfast", "eggs", "burrito"], ["egg", "milk", "wheat"], image("breakfast")),
  item("m_hot_cakes", "Breakfast Specials", "#1 Two Hot Cakes and 2 Eggs", "Two pancakes, two eggs, and choice of bacon or sausage.", 9.99, ["breakfast", "pancakes", "eggs"], ["egg", "milk", "wheat"], image("pancakes")),
  item("m_steak_eggs", "Breakfast Specials", "Steak and Eggs", "Steak with hash browns and toast.", 17.49, ["breakfast", "steak", "eggs"], ["egg", "wheat"], image("steak")),
  item("m_huevos", "Breakfast Specials", "Huevos Rancheros", "Eggs with ranchero sauce, hash browns, beans, and tortillas.", 14.99, ["breakfast", "mexican", "eggs"], ["egg"], image("huevos")),
  item("m_cheeseburger_combo", "Combos", "Cheeseburger Combo", "Cheeseburger served with fries and a soda.", 12.86, ["lunch", "dinner", "combo", "burger"], ["milk", "wheat"], image("cheeseburger")),
  item("m_bacon_avocado_combo", "Combos", "Bacon Avocado Burger Combo", "Bacon avocado burger served with fries and a soda.", 14.99, ["lunch", "dinner", "combo", "burger"], ["milk", "wheat"], image("avocadoBurger")),
  item("m_pastrami_combo", "Combos", "Pastrami Burger Combo", "Pastrami burger served with fries and a soda.", 18.74, ["lunch", "dinner", "combo", "burger"], ["milk", "wheat"], image("pastrami")),
  item("m_veggie_combo", "Combos", "Veggie Burger Combo", "Veggie burger served with fries and a soda.", 14.99, ["lunch", "dinner", "vegetarian", "combo"], ["milk", "wheat"], image("veggieBurger")),
  item("m_hamburger", "Burgers", "Hamburger", "Classic hamburger with thousand island dressing, onion, lettuce, and tomato.", 6.24, ["lunch", "dinner", "burger"], ["wheat"], image("hamburger")),
  item("m_cheeseburger", "Burgers", "Cheeseburger", "Classic burger with American cheese.", 7.49, ["lunch", "dinner", "burger"], ["milk", "wheat"], image("cheeseburger")),
  item("m_bacon_cheeseburger", "Burgers", "Bacon Cheeseburger", "Cheeseburger topped with bacon.", 9.86, ["lunch", "dinner", "burger", "bacon"], ["milk", "wheat"], image("baconBurger")),
  item("m_chili_cheeseburger", "Burgers", "Chili Cheeseburger", "Cheeseburger topped with house chili.", 10.11, ["lunch", "dinner", "burger", "chili"], ["milk", "wheat"], image("chiliBurger")),
  item("m_wet_burrito", "Mexican Food", "Wet Burrito", "Burrito with ranchero sauce and melted cheese.", 14.99, ["lunch", "dinner", "mexican", "burrito"], ["milk", "wheat"], image("burrito")),
  item("m_lunch_street_tacos", "Mexican Food", "Lunch Street Tacos", "Two soft corn tacos with choice of meat, salsa, onion, and cilantro.", 7.49, ["lunch", "mexican", "tacos", "popular"], ["milk"], image("tacos"), { lunch: 96 }),
  item("m_dinner_asada_tacos", "Mexican Food", "Dinner Asada Tacos Plate", "Three asada tacos with rice, beans, salsa, and lime.", 13.99, ["dinner", "mexican", "tacos", "popular"], ["milk"], image("tacos"), { dinner: 94 }),
  item("m_tacos", "Mexican Food", "Tacos", "Soft corn tortillas with choice of meat, lettuce, cheese, and salsa.", 3.13, ["lunch", "dinner", "mexican", "tacos"], ["milk"], image("tacos"), { lunch: 88, dinner: 86 }),
  item("m_asada_fries", "Mexican Food", "Asada Fries", "Fries topped with asada, cheese, salsa, and sour cream.", 14.99, ["lunch", "dinner", "mexican", "fries"], ["milk"], image("loadedFries")),
  item("m_pastrami_sandwich", "Sandwiches & Melts", "Pastrami Sandwich", "Pastrami on a roll with mustard and pickle.", 16.24, ["lunch", "dinner", "sandwich"], ["wheat"], image("sandwich")),
  item("m_patty_melt", "Sandwiches & Melts", "Patty Melt", "Burger patty with American cheese and grilled onions on rye.", 9.24, ["lunch", "dinner", "melt"], ["milk", "wheat"], image("pattyMelt")),
  item("m_chicken_sandwich", "Sandwiches & Melts", "Chicken Sandwich", "Broiled chicken sandwich with mayo, lettuce, and tomato.", 11.99, ["lunch", "dinner", "chicken", "sandwich"], ["egg", "wheat"], image("chickenSandwich")),
  item("m_fries", "Sides", "Fries", "Crispy french fries.", 6.24, ["lunch", "dinner", "side", "vegetarian"], [], image("fries")),
  item("m_chili_cheese_fries", "Sides", "Chili Cheese Fries", "Fries topped with chili, jack and cheddar cheese, and diced onions.", 10.63, ["lunch", "dinner", "side", "chili"], ["milk"], image("loadedFries")),
  item("m_onion_rings", "Sides", "Onion Rings", "Lightly breaded onion rings.", 9.99, ["lunch", "dinner", "side", "vegetarian"], ["wheat"], image("onionRings")),
  item("m_kids_cheeseburger", "Kids Meals", "Kids Cheeseburger", "Kids cheeseburger meal.", 7.49, ["kids", "lunch", "dinner"], ["milk", "wheat"], image("kidsBurger")),
  item("m_kids_nuggets", "Kids Meals", "Kids Chicken Nuggets", "Kids chicken nuggets meal.", 7.49, ["kids", "lunch", "dinner"], ["wheat"], image("nuggets")),
  item("m_soda", "Drinks", "Soda", "Fountain soda.", 2.49, ["drink", "all_day"], [], image("soda"))
];

function item(id, category, name, description, price, tags, allergens, imageUrl, demand = {}) {
  return {
    id,
    category,
    name,
    description,
    price,
    tags,
    allergens,
    is_available: true,
    image_url: imageUrl,
    demand,
    availability: tags.includes("all_day")
      ? ["all_day"]
      : ["breakfast", "lunch", "dinner"].filter((dayPart) => tags.includes(dayPart))
  };
}

function image(key) {
  const images = {
    avocadoBurger: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=640&q=80",
    baconBurger: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=640&q=80",
    breakfast: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=640&q=80",
    burrito: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=640&q=80",
    cheeseburger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80",
    chickenSandwich: "https://images.unsplash.com/photo-1606755962773-d324e2e5d3b6?auto=format&fit=crop&w=640&q=80",
    chiliBurger: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=640&q=80",
    fries: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=640&q=80",
    hamburger: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=640&q=80",
    huevos: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=640&q=80",
    kidsBurger: "https://images.unsplash.com/photo-1610440042657-612c34d95e9f?auto=format&fit=crop&w=640&q=80",
    loadedFries: "https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=640&q=80",
    nuggets: "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=640&q=80",
    onionRings: "https://images.unsplash.com/photo-1625938145744-e380515399f0?auto=format&fit=crop&w=640&q=80",
    pancakes: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=640&q=80",
    pastrami: "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=640&q=80",
    pattyMelt: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=640&q=80",
    sandwich: "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=640&q=80",
    soda: "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=640&q=80",
    steak: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=640&q=80",
    tacos: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=640&q=80",
    veggieBurger: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=640&q=80"
  };
  return images[key] || images.cheeseburger;
}

function locationImage(key) {
  const images = {
    anaheim: "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=720&q=80",
    colton: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=720&q=80",
    hesperia: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=720&q=80",
    irvine: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=720&q=80",
    longBeach: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=720&q=80",
    ontario: "https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=720&q=80",
    pasadena: "https://images.unsplash.com/photo-1555992336-fb0d29498b13?auto=format&fit=crop&w=720&q=80",
    riverside: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=720&q=80",
    sanDiego: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=720&q=80",
    torrance: "https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=720&q=80"
  };
  return images[key] || images.hesperia;
}

module.exports = { restaurants, menuItems };
