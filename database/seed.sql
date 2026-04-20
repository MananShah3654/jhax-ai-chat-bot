INSERT INTO ai.restaurants (name, address, city, state, postal_code, phone, is_demo, hours) VALUES
('Olympic Flame Burgers - Hesperia', '16304 Main St', 'Hesperia', 'CA', '92345', '(760) 244-1992', false, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Torrance', '20720 Normandie Ave', 'Torrance', 'CA', '90502', '(310) 532-0195', false, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Colton', '1609 W Valley Blvd', 'Colton', 'CA', '92324', '(909) 572-6221', false, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Anaheim Demo', '510 Harbor Blvd', 'Anaheim', 'CA', '92805', '(714) 555-0181', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Riverside Demo', '290 Market St', 'Riverside', 'CA', '92501', '(951) 555-0144', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Pasadena Demo', '88 Colorado Blvd', 'Pasadena', 'CA', '91101', '(626) 555-0177', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Long Beach Demo', '412 Ocean Blvd', 'Long Beach', 'CA', '90802', '(562) 555-0108', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Irvine Demo', '38 Jamboree Rd', 'Irvine', 'CA', '92602', '(949) 555-0129', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - Ontario Demo', '330 Euclid Ave', 'Ontario', 'CA', '91762', '(909) 555-0162', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}'),
('Olympic Flame Burgers - San Diego Demo', '701 Market St', 'San Diego', 'CA', '92101', '(619) 555-0190', true, '{"sun_thu":"6:00am-9:00pm","fri_sat":"6:00am-10:00pm"}')
ON CONFLICT DO NOTHING;

UPDATE ai.restaurants SET image_url = CASE
  WHEN city = 'Hesperia' THEN 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Torrance' THEN 'https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Colton' THEN 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Anaheim' THEN 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Riverside' THEN 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Pasadena' THEN 'https://images.unsplash.com/photo-1555992336-fb0d29498b13?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Long Beach' THEN 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Irvine' THEN 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'Ontario' THEN 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=720&q=80'
  WHEN city = 'San Diego' THEN 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=720&q=80'
  ELSE image_url
END;

INSERT INTO ai.menu_categories (name, display_order) VALUES
('Breakfast Specials', 10),
('Combos', 20),
('Burgers', 30),
('Mexican Food', 40),
('Sandwiches & Melts', 50),
('Sides', 60),
('Kids Meals', 70),
('Drinks', 80)
ON CONFLICT DO NOTHING;

WITH cats AS (
  SELECT id, name FROM ai.menu_categories
), inserted AS (
  INSERT INTO ai.menu_items (category_id, name, description, price, tags, allergens)
  SELECT cats.id, item.name, item.description, item.price, item.tags, item.allergens
  FROM cats
  JOIN (
    VALUES
    ('Breakfast Specials', 'Breakfast Burrito with Meat', 'Three eggs with bacon, sausage, hash browns, and cheese.', 12.49, ARRAY['breakfast','eggs','burrito'], ARRAY['egg','milk','wheat']),
    ('Breakfast Specials', '#1 Two Hot Cakes and 2 Eggs', 'Two pancakes, two eggs, and choice of bacon or sausage.', 9.99, ARRAY['breakfast','pancakes','eggs'], ARRAY['egg','milk','wheat']),
    ('Breakfast Specials', 'Steak and Eggs', 'Steak with hash browns and toast.', 17.49, ARRAY['breakfast','steak','eggs'], ARRAY['egg','wheat']),
    ('Breakfast Specials', 'Huevos Rancheros', 'Eggs with ranchero sauce, hash browns, beans, and tortillas.', 14.99, ARRAY['breakfast','mexican','eggs'], ARRAY['egg']),
    ('Combos', 'Cheeseburger Combo', 'Cheeseburger served with fries and a soda.', 12.86, ARRAY['lunch','dinner','combo','burger'], ARRAY['milk','wheat']),
    ('Combos', 'Bacon Avocado Burger Combo', 'Bacon avocado burger served with fries and a soda.', 14.99, ARRAY['lunch','dinner','combo','burger'], ARRAY['milk','wheat']),
    ('Combos', 'Pastrami Burger Combo', 'Pastrami burger served with fries and a soda.', 18.74, ARRAY['lunch','dinner','combo','burger'], ARRAY['milk','wheat']),
    ('Combos', 'Veggie Burger Combo', 'Veggie burger served with fries and a soda.', 14.99, ARRAY['lunch','dinner','vegetarian','combo'], ARRAY['milk','wheat']),
    ('Burgers', 'Hamburger', 'Classic hamburger with thousand island dressing, onion, lettuce, and tomato.', 6.24, ARRAY['lunch','dinner','burger'], ARRAY['wheat']),
    ('Burgers', 'Cheeseburger', 'Classic burger with American cheese.', 7.49, ARRAY['lunch','dinner','burger'], ARRAY['milk','wheat']),
    ('Burgers', 'Bacon Cheeseburger', 'Cheeseburger topped with bacon.', 9.86, ARRAY['lunch','dinner','burger','bacon'], ARRAY['milk','wheat']),
    ('Burgers', 'Chili Cheeseburger', 'Cheeseburger topped with house chili.', 10.11, ARRAY['lunch','dinner','burger','chili'], ARRAY['milk','wheat']),
    ('Mexican Food', 'Wet Burrito', 'Burrito with ranchero sauce and melted cheese.', 14.99, ARRAY['lunch','dinner','mexican','burrito'], ARRAY['milk','wheat']),
    ('Mexican Food', 'Lunch Street Tacos', 'Two soft corn tacos with choice of meat, salsa, onion, and cilantro.', 7.49, ARRAY['lunch','mexican','tacos','popular'], ARRAY['milk']),
    ('Mexican Food', 'Dinner Asada Tacos Plate', 'Three asada tacos with rice, beans, salsa, and lime.', 13.99, ARRAY['dinner','mexican','tacos','popular'], ARRAY['milk']),
    ('Mexican Food', 'Tacos', 'Soft corn tortillas with choice of meat, lettuce, cheese, and salsa.', 3.13, ARRAY['lunch','dinner','mexican','tacos'], ARRAY['milk']),
    ('Mexican Food', 'Asada Fries', 'Fries topped with asada, cheese, salsa, and sour cream.', 14.99, ARRAY['lunch','dinner','mexican','fries'], ARRAY['milk']),
    ('Sandwiches & Melts', 'Pastrami Sandwich', 'Pastrami on a roll with mustard and pickle.', 16.24, ARRAY['lunch','dinner','sandwich'], ARRAY['wheat']),
    ('Sandwiches & Melts', 'Patty Melt', 'Burger patty with American cheese and grilled onions on rye.', 9.24, ARRAY['lunch','dinner','melt'], ARRAY['milk','wheat']),
    ('Sandwiches & Melts', 'Chicken Sandwich', 'Broiled chicken sandwich with mayo, lettuce, and tomato.', 11.99, ARRAY['lunch','dinner','chicken','sandwich'], ARRAY['egg','wheat']),
    ('Sides', 'Fries', 'Crispy french fries.', 6.24, ARRAY['lunch','dinner','side','vegetarian'], ARRAY[]::text[]),
    ('Sides', 'Chili Cheese Fries', 'Fries topped with chili, jack and cheddar cheese, and diced onions.', 10.63, ARRAY['lunch','dinner','side','chili'], ARRAY['milk']),
    ('Sides', 'Onion Rings', 'Lightly breaded onion rings.', 9.99, ARRAY['lunch','dinner','side','vegetarian'], ARRAY['wheat']),
    ('Kids Meals', 'Kids Cheeseburger', 'Kids cheeseburger meal.', 7.49, ARRAY['kids','lunch','dinner'], ARRAY['milk','wheat']),
    ('Kids Meals', 'Kids Chicken Nuggets', 'Kids chicken nuggets meal.', 7.49, ARRAY['kids','lunch','dinner'], ARRAY['wheat']),
    ('Drinks', 'Soda', 'Fountain soda.', 2.49, ARRAY['drink','all_day'], ARRAY[]::text[])
  ) AS item(category_name, name, description, price, tags, allergens)
  ON cats.name = item.category_name
  ON CONFLICT DO NOTHING
  RETURNING id, tags
)
INSERT INTO ai.restaurant_menu_items (restaurant_id, menu_item_id)
SELECT r.id, m.id FROM ai.restaurants r CROSS JOIN ai.menu_items m
ON CONFLICT DO NOTHING;

INSERT INTO ai.item_availability (menu_item_id, day_part)
SELECT id, 'all_day' FROM ai.menu_items WHERE 'all_day' = ANY(tags)
ON CONFLICT DO NOTHING;

INSERT INTO ai.item_availability (menu_item_id, day_part)
SELECT id, 'breakfast' FROM ai.menu_items WHERE 'breakfast' = ANY(tags)
ON CONFLICT DO NOTHING;

INSERT INTO ai.item_availability (menu_item_id, day_part)
SELECT id, 'lunch' FROM ai.menu_items WHERE 'lunch' = ANY(tags)
ON CONFLICT DO NOTHING;

INSERT INTO ai.item_availability (menu_item_id, day_part)
SELECT id, 'dinner' FROM ai.menu_items WHERE 'dinner' = ANY(tags)
ON CONFLICT DO NOTHING;

UPDATE ai.menu_items SET image_url = CASE
  WHEN name ILIKE '%burrito%' THEN 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%taco%' THEN 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%fries%' THEN 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%rings%' THEN 'https://images.unsplash.com/photo-1625938145744-e380515399f0?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%chicken%' THEN 'https://images.unsplash.com/photo-1606755962773-d324e2e5d3b6?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%sandwich%' THEN 'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%pancake%' OR name ILIKE '%hot cake%' THEN 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%steak%' THEN 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%huevos%' THEN 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=640&q=80'
  WHEN name ILIKE '%soda%' THEN 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=640&q=80'
  ELSE 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80'
END;

UPDATE ai.menu_items SET demand = CASE
  WHEN name = 'Lunch Street Tacos' THEN '{"lunch":96}'::jsonb
  WHEN name = 'Dinner Asada Tacos Plate' THEN '{"dinner":94}'::jsonb
  WHEN name = 'Tacos' THEN '{"lunch":88,"dinner":86}'::jsonb
  WHEN name ILIKE '%bacon avocado%' THEN '{"lunch":91,"dinner":89}'::jsonb
  WHEN name ILIKE '%cheeseburger combo%' THEN '{"lunch":87,"dinner":84}'::jsonb
  WHEN name ILIKE '%pastrami%' THEN '{"dinner":90}'::jsonb
  ELSE demand
END;

INSERT INTO private_backoffice.sales_reports (report_date, gross_sales, net_sales, manager_notes)
VALUES (current_date - 1, 14203.12, 11882.45, 'Private sample. AI role must not read this.');

INSERT INTO private_backoffice.employee_payroll (employee_name, ssn_last4, hourly_rate, bank_token)
VALUES ('Private Demo Employee', '1234', 24.50, 'bank_tok_demo_private');

INSERT INTO private_backoffice.payment_tokens (customer_reference, processor_token, last4)
VALUES ('cust_private_demo', 'pay_tok_demo_private', '4242');
