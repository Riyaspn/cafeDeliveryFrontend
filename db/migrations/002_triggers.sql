-- =============================================================
-- CafeQR Delivery — DB Triggers
-- Target: PostgreSQL (Docker)
-- =============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_orders_updated_at ON delivery_orders;
CREATE TRIGGER trg_delivery_orders_updated_at
  BEFORE UPDATE ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_agents_updated_at ON delivery_agents;
CREATE TRIGGER trg_delivery_agents_updated_at
  BEFORE UPDATE ON delivery_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_addresses_updated_at ON delivery_addresses;
CREATE TRIGGER trg_delivery_addresses_updated_at
  BEFORE UPDATE ON delivery_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- pg_notify on order status change
-- The Next.js API layer reads this via pg LISTEN or via RabbitMQ worker.
CREATE OR REPLACE FUNCTION notify_delivery_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    PERFORM pg_notify(
      'delivery_order_status_changed',
      json_build_object(
        'id',           NEW.id,
        'order_no',     NEW.order_no,
        'client_id',    NEW.client_id,
        'org_id',       NEW.org_id,
        'order_status', NEW.order_status,
        'customer_id',  NEW.customer_id,
        'agent_id',     NEW.agent_id,
        'updated_at',   NEW.updated_at
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_delivery_status ON delivery_orders;
CREATE TRIGGER trg_notify_delivery_status
  AFTER UPDATE ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION notify_delivery_order_status_change();

-- View: active orders with restaurant info
-- Adjust table/column names to match your existing clients/organizations schema.
CREATE OR REPLACE VIEW v_active_delivery_orders AS
SELECT
  d.*,
  c.name       AS restaurant_name,
  c.logo_url   AS restaurant_logo,
  c.phone      AS restaurant_phone,
  o.name       AS branch_name,
  o.address    AS branch_address
FROM delivery_orders d
JOIN clients c      ON c.id = d.client_id
LEFT JOIN organizations o ON o.id = d.org_id
WHERE d.isactive = 'Y'
  AND d.order_status NOT IN ('DELIVERED', 'CANCELLED');
