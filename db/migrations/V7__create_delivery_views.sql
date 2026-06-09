-- ============================================================
-- V7__create_delivery_views.sql
-- CafeQR Delivery — Helper views for common backend queries
-- ============================================================

-- Active orders with restaurant and agent info joined
CREATE OR REPLACE VIEW v_active_delivery_orders AS
SELECT
    d.id,
    d.order_no,
    d.order_type,
    d.order_status,
    d.payment_status,
    d.payment_method,
    d.customer_name,
    d.customer_phone,
    d.customer_email,
    d.delivery_address,
    d.order_lines_snapshot,
    d.subtotal_amount,
    d.total_tax_amount,
    d.delivery_fee,
    d.grand_total,
    d.estimated_time_minutes,
    d.order_date,
    d.notes,
    d.client_id,
    d.org_id,
    -- Restaurant info
    c.name          AS restaurant_name,
    c.phone         AS restaurant_phone,
    -- Branch info
    o.name          AS branch_name,
    o.address       AS branch_address,
    -- Agent info
    a.name          AS agent_name,
    a.phone         AS agent_phone,
    a.vehicle_type  AS agent_vehicle_type
FROM  delivery_orders d
JOIN  clients         c ON c.id = d.client_id
LEFT JOIN organizations o ON o.id = d.org_id
LEFT JOIN delivery_agents a ON a.id = d.agent_id
WHERE d.isactive = 'Y'
  AND d.order_status NOT IN ('DELIVERED', 'CANCELLED');

COMMENT ON VIEW v_active_delivery_orders IS 'All non-terminal delivery orders with restaurant, branch, and agent details joined';


-- Order history per customer phone (for order history page)
-- Used by: GET /delivery/orders?phone=&orgId=
-- orgId = organizations.id (branch UUID) — NOT the top-level clientId.
-- Backend derives clientId from orgId internally via organizations.clientid.
CREATE OR REPLACE VIEW v_customer_order_history AS
SELECT
    d.id,
    d.order_no,
    d.order_type,
    d.order_status,
    d.payment_status,
    d.payment_method,
    d.grand_total,
    d.order_date,
    d.customer_phone,
    d.client_id,
    d.org_id,
    c.name AS restaurant_name,
    o.name AS branch_name
FROM  delivery_orders d
JOIN  clients c ON c.id = d.client_id
LEFT JOIN organizations o ON o.id = d.org_id
WHERE d.isactive = 'Y'
ORDER BY d.order_date DESC;

COMMENT ON VIEW v_customer_order_history IS 'Order history per customer, used by GET /delivery/orders?phone=&orgId= (branch-level)';
