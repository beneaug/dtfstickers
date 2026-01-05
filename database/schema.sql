-- Sticker Orders Platform Schema
-- Database schema for the sticker ordering system

-- Main orders table
CREATE TABLE IF NOT EXISTS sticker_orders (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Order details
  type VARCHAR(50) NOT NULL DEFAULT 'sticker',
  job_name VARCHAR(100) NOT NULL,
  material_id VARCHAR(50) NOT NULL,
  material_name VARCHAR(100) NOT NULL,
  size VARCHAR(100) NOT NULL,
  cutting_id VARCHAR(50) NOT NULL,
  cutting_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,

  -- Files and pricing
  file_key VARCHAR(500) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  total_price_cents INTEGER NOT NULL,

  -- Payment
  stripe_session_id VARCHAR(255) UNIQUE,

  -- Shipping
  shipping_address JSONB,

  -- Customer contact information
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_name VARCHAR(255),

  -- Cart grouping (for multi-item checkouts)
  cart_order_id VARCHAR(100),

  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sticker_orders_status ON sticker_orders(status);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_created_at ON sticker_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_stripe_session ON sticker_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_customer_email ON sticker_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_cart_order_id ON sticker_orders(cart_order_id);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_material ON sticker_orders(material_id);
CREATE INDEX IF NOT EXISTS idx_sticker_orders_cutting ON sticker_orders(cutting_id);

-- Operators table for authentication
CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operators_username ON operators(username);

-- Comments for documentation
COMMENT ON TABLE sticker_orders IS 'Customer orders for custom stickers';
COMMENT ON COLUMN sticker_orders.file_key IS 'S3 file key for the uploaded artwork';
COMMENT ON COLUMN sticker_orders.file_url IS 'S3 file URL for the uploaded artwork';
COMMENT ON COLUMN sticker_orders.shipping_address IS 'Stripe shipping address object with name, line1, line2, city, state, postal_code, country';
COMMENT ON COLUMN sticker_orders.customer_email IS 'Customer email address from Stripe checkout';
COMMENT ON COLUMN sticker_orders.customer_phone IS 'Customer phone number from Stripe checkout (if provided)';
COMMENT ON COLUMN sticker_orders.customer_name IS 'Customer name from Stripe checkout (billing name)';
COMMENT ON COLUMN sticker_orders.type IS 'Order type: sticker';
COMMENT ON COLUMN sticker_orders.status IS 'Order status: pending, completed, or cancelled';
COMMENT ON COLUMN sticker_orders.cart_order_id IS 'Groups multiple items from the same cart checkout session';
COMMENT ON COLUMN sticker_orders.material_id IS 'Material identifier (e.g., premium-vinyl, holographic)';
COMMENT ON COLUMN sticker_orders.cutting_id IS 'Cutting type identifier (e.g., die-cut, kiss-cut)';
