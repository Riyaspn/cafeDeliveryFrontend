-- =============================================================
-- CafeQR Delivery — New Tables Migration
-- Target: PostgreSQL (Docker container)
-- Run method:
--   Option A: Mounted as docker-entrypoint-initdb.d/ (auto on first start)
--   Option B: psql -U cafeqr_user -d cafeqr_delivery -f 001_delivery_tables.sql
--   Option C: node scripts/db-migrate.js
-- All tables use IF NOT EXISTS — safe to re-run.
-- Does NOT alter any existing tables.
-- =============================================================

-- -----------------------------------------------------------
-- 1. delivery_orders
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL,
  org_id                uuid,
  order_no              varchar NOT NULL,
  order_type            varchar NOT NULL DEFAULT 'DELIVERY',
  order_status          varchar NOT NULL DEFAULT 'PENDING',
  payment_status        varchar NOT NULL DEFAULT 'PENDING',
  payment_method        varchar DEFAULT 'CASH',
  customer_id           uuid,
  customer_name         varchar NOT NULL,
  customer_phone        varchar NOT NULL,
  customer_email        varchar,
  -- { line1, line2, area, city, pincode, landmark, lat, lng }
  delivery_address      jsonb,
  agent_id              uuid,
  agent_assigned_at     timestamp,
  picked_up_at          timestamp,
  delivered_at          timestamp,
  total_amount          numeric NOT NULL DEFAULT 0,
  total_tax_amount      numeric DEFAULT 0,
  total_discount_amount numeric DEFAULT 0,
  delivery_fee          numeric DEFAULT 0,
  grand_total           numeric NOT NULL DEFAULT 0,
  currency              varchar DEFAULT 'INR',
  -- Array of: { product_id, product_name, quantity, unit_price, line_total }
  order_lines_snapshot  jsonb DEFAULT '[]',
  estimated_time_minutes integer DEFAULT 30,
  order_date            timestamp DEFAULT CURRENT_TIMESTAMP,
  confirmed_at          timestamp,
  cancelled_at          timestamp,
  cancellation_reason   text,
  cancelled_by          varchar,
  pos_order_id          uuid,       -- set after restaurant creates POS order
  order_source          varchar DEFAULT 'ONLINE',
  notes                 text,
  isactive              char DEFAULT 'Y',
  created_at            timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamp DEFAULT CURRENT_TIMESTAMP,
  version               bigint NOT NULL DEFAULT 0,
  CONSTRAINT delivery_orders_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_client_id  ON delivery_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_org_id     ON delivery_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status     ON delivery_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_phone      ON delivery_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_created_at ON delivery_orders(created_at DESC);

-- -----------------------------------------------------------
-- 2. delivery_agents
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_agents (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL,
  org_id       uuid,
  name         varchar NOT NULL,
  phone        varchar NOT NULL,
  email        varchar,
  photo_url    text,
  status       varchar DEFAULT 'AVAILABLE',
  vehicle_type varchar,
  vehicle_no   varchar,
  is_active    boolean DEFAULT true,
  created_at   timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_agents_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_agents_client_id ON delivery_agents(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_agents_status    ON delivery_agents(status);

-- -----------------------------------------------------------
-- 3. delivery_fcm_tokens
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_fcm_tokens (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id   uuid,
  org_id      uuid,
  role        varchar NOT NULL,
  entity_id   uuid,
  token       text NOT NULL,
  device_type varchar DEFAULT 'web',
  is_active   boolean DEFAULT true,
  last_seen_at timestamp DEFAULT CURRENT_TIMESTAMP,
  created_at  timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_fcm_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_fcm_tokens_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_client_org ON delivery_fcm_tokens(client_id, org_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_entity_id  ON delivery_fcm_tokens(entity_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_role       ON delivery_fcm_tokens(role);

-- -----------------------------------------------------------
-- 4. delivery_notifications_log
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_notifications_log (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES delivery_orders(id),
  client_id   uuid,
  target_role varchar NOT NULL,
  event_type  varchar NOT NULL,
  title       text,
  body        text,
  data        jsonb DEFAULT '{}',
  sent_at     timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_notifications_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_notif_log_order_id  ON delivery_notifications_log(order_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_client_id ON delivery_notifications_log(client_id);

-- -----------------------------------------------------------
-- 5. delivery_addresses
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_addresses (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id      uuid,
  customer_phone varchar NOT NULL,
  label          varchar DEFAULT 'Home',
  line1          text NOT NULL,
  line2          text,
  area           varchar,
  city           varchar,
  pincode        varchar,
  landmark       text,
  latitude       double precision,
  longitude      double precision,
  is_default     boolean DEFAULT false,
  is_active      boolean DEFAULT true,
  created_at     timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_addresses_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_del_addresses_phone     ON delivery_addresses(customer_phone);
CREATE INDEX IF NOT EXISTS idx_del_addresses_client_id ON delivery_addresses(client_id);

-- -----------------------------------------------------------
-- 6. delivery_settings
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_settings (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL,
  org_id                  uuid,
  is_delivery_enabled     boolean DEFAULT true,
  is_takeaway_enabled     boolean DEFAULT true,
  delivery_fee            numeric DEFAULT 40,
  free_delivery_above     numeric DEFAULT 299,
  min_order_amount        numeric DEFAULT 0,
  max_delivery_radius_km  double precision DEFAULT 5,
  estimated_time_min      integer DEFAULT 20,
  estimated_time_max      integer DEFAULT 40,
  operating_hours         jsonb DEFAULT '{}',
  promo_text              text,
  created_at              timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at              timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_settings_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_settings_client_org_unique UNIQUE (client_id, org_id)
);
