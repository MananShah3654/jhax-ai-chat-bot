CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_app') THEN
    CREATE ROLE ai_app LOGIN PASSWORD 'ai_demo_password';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS private_backoffice;

CREATE TABLE IF NOT EXISTS ai.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  phone text,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  is_demo boolean NOT NULL DEFAULT false,
  image_url text NOT NULL DEFAULT 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=720&q=80',
  hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, city, state, postal_code)
);

CREATE TABLE IF NOT EXISTS ai.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 100,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS ai.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES ai.menu_categories(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  tags text[] NOT NULL DEFAULT '{}',
  allergens text[] NOT NULL DEFAULT '{}',
  image_url text NOT NULL DEFAULT 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80',
  demand jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_available boolean NOT NULL DEFAULT true,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(tags, ' '))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS ai.restaurant_menu_items (
  restaurant_id uuid NOT NULL REFERENCES ai.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES ai.menu_items(id) ON DELETE CASCADE,
  PRIMARY KEY (restaurant_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS ai.item_availability (
  menu_item_id uuid NOT NULL REFERENCES ai.menu_items(id) ON DELETE CASCADE,
  day_part text NOT NULL CHECK (day_part IN ('breakfast', 'lunch', 'dinner', 'all_day')),
  PRIMARY KEY (menu_item_id, day_part)
);

CREATE TABLE IF NOT EXISTS ai.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES ai.restaurants(id),
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS ai.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES ai.orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES ai.menu_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  item_name text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ai.tool_audit_log (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_backoffice.sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  report_date date NOT NULL,
  gross_sales numeric(12,2) NOT NULL,
  net_sales numeric(12,2) NOT NULL,
  manager_notes text
);

CREATE TABLE IF NOT EXISTS private_backoffice.employee_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  ssn_last4 text NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  bank_token text NOT NULL
);

CREATE TABLE IF NOT EXISTS private_backoffice.payment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_reference text NOT NULL,
  processor_token text NOT NULL,
  last4 text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_items_search_vector ON ai.menu_items USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_menu_items_tags ON ai.menu_items USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_availability_day_part ON ai.item_availability(day_part);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ai.orders(status);

REVOKE ALL ON SCHEMA private_backoffice FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA private_backoffice FROM PUBLIC;

GRANT USAGE ON SCHEMA ai TO ai_app;
GRANT SELECT ON ai.restaurants, ai.menu_categories, ai.menu_items, ai.restaurant_menu_items, ai.item_availability TO ai_app;
GRANT SELECT, INSERT, UPDATE ON ai.orders, ai.order_items, ai.tool_audit_log TO ai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO ai_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA private_backoffice REVOKE ALL ON TABLES FROM PUBLIC;
