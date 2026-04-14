-- ============================
-- Sentimo Pre-Orders Table
-- Run this in your Supabase SQL editor
-- ============================

CREATE TABLE IF NOT EXISTS preorders (
  id                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                 TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                 TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Stripe references
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id   TEXT,
  stripe_customer_id         TEXT,

  -- Customer info
  email                      TEXT NOT NULL,
  full_name                  TEXT,

  -- Product
  product_slug               TEXT NOT NULL DEFAULT 'sentimo-2-pack',
  quantity                   INTEGER NOT NULL DEFAULT 1,
  unit_price                 INTEGER NOT NULL,          -- in cents
  total_amount               INTEGER NOT NULL,          -- in cents
  currency                   TEXT NOT NULL DEFAULT 'usd',

  -- Order classification
  order_type                 TEXT NOT NULL DEFAULT 'preorder',
  expected_ship_label        TEXT NOT NULL DEFAULT 'August 2026',

  -- Statuses
  order_status               TEXT NOT NULL DEFAULT 'pending',
  fulfillment_status         TEXT DEFAULT 'pending',
  refund_status              TEXT,
  refund_amount              INTEGER,                   -- in cents

  -- Marketing
  marketing_opt_in           BOOLEAN DEFAULT false,

  -- Shipping address (collected via Stripe Checkout)
  shipping_name              TEXT,
  shipping_line1             TEXT,
  shipping_line2             TEXT,
  shipping_city              TEXT,
  shipping_state             TEXT,
  shipping_postal_code       TEXT,
  shipping_country           TEXT,

  -- Internal notes
  notes                      TEXT
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_preorders_email ON preorders (email);
CREATE INDEX IF NOT EXISTS idx_preorders_order_status ON preorders (order_status);
CREATE INDEX IF NOT EXISTS idx_preorders_payment_intent ON preorders (stripe_payment_intent_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS preorders_updated_at ON preorders;
CREATE TRIGGER preorders_updated_at
  BEFORE UPDATE ON preorders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (restrict to service role only)
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;

-- Only the service_role can access preorders (API calls use service role key)
CREATE POLICY "Service role full access" ON preorders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
