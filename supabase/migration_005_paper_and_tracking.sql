-- Thermal paper orders, paper roll stock, shipping charges, and shipment tracking.
-- Apply after migration_004. Safe to run once; the opening stock insert is idempotent.
BEGIN;

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS paper_bundles JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"classic":1,"sweet":2} packs of 3 rolls
  ADD COLUMN IF NOT EXISTS roll_counts JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {"white":3,"pink":1,...} individual rolls
  ADD COLUMN IF NOT EXISTS shipping_amount INTEGER,                            -- cents charged for shipping
  ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,                              -- usps | ups | fedex | other
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_email_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.valid_sentimo_roll_counts(counts JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item RECORD;
BEGIN
  IF counts IS NULL OR jsonb_typeof(counts) <> 'object' THEN
    RETURN FALSE;
  END IF;
  FOR item IN SELECT key, value FROM jsonb_each(counts) LOOP
    IF item.key NOT IN ('white', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange')
      OR jsonb_typeof(item.value) <> 'number'
      OR item.value::text !~ '^[1-9][0-9]*$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

-- An order holds printers, paper, or both. Paper-only orders have empty color_counts.
ALTER TABLE public.preorders DROP CONSTRAINT IF EXISTS preorders_color_counts_valid;
ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_color_counts_valid CHECK (
    public.valid_sentimo_color_counts(color_counts)
    OR (color_counts = '{}'::jsonb AND roll_counts <> '{}'::jsonb)
  ),
  ADD CONSTRAINT preorders_roll_counts_valid CHECK (public.valid_sentimo_roll_counts(roll_counts));

-- Paper roll stock ledger (one row per roll movement, like inventory_movements).
CREATE TABLE IF NOT EXISTS public.paper_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  color TEXT NOT NULL CHECK (color IN ('white', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('opening', 'giveaway', 'shipment', 'return', 'damage', 'adjustment')),
  reference_key TEXT NOT NULL UNIQUE,
  notes TEXT
);

ALTER TABLE public.paper_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.paper_movements;
CREATE POLICY "Service role full access" ON public.paper_movements
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE VIEW public.paper_stock WITH (security_invoker = true) AS
WITH colors(color) AS (VALUES ('white'), ('pink'), ('purple'), ('yellow'), ('mint'), ('blue'), ('orange')),
physical AS (
  SELECT color, SUM(quantity_delta)::INTEGER AS on_hand
  FROM public.paper_movements GROUP BY color
),
reserved AS (
  SELECT entry.key AS color, SUM((entry.value #>> '{}')::INTEGER)::INTEGER AS units
  FROM public.preorders AS orders
  CROSS JOIN LATERAL jsonb_each(orders.roll_counts) AS entry
  WHERE orders.order_status IN ('paid', 'partially_refunded')
    AND COALESCE(orders.fulfillment_status, 'pending') NOT IN
      ('fulfilled', 'shipped', 'cancelled')
  GROUP BY entry.key
)
SELECT colors.color,
       COALESCE(physical.on_hand, 0) AS physical_on_hand,
       COALESCE(reserved.units, 0) AS sold_unshipped,
       COALESCE(physical.on_hand, 0) - COALESCE(reserved.units, 0) AS available_to_sell
FROM colors
LEFT JOIN physical USING (color)
LEFT JOIN reserved USING (color);

REVOKE ALL ON public.paper_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paper_stock TO service_role;
GRANT ALL ON public.paper_movements TO service_role;

-- Shipping an order now records printer movements AND paper roll movements, once.
CREATE OR REPLACE FUNCTION public.record_sentimo_shipment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE was_shipped BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    was_shipped := FALSE;
  ELSE
    was_shipped := COALESCE(OLD.fulfillment_status, 'pending') IN ('shipped', 'fulfilled');
    IF was_shipped AND COALESCE(NEW.fulfillment_status, 'pending') NOT IN ('shipped', 'fulfilled') THEN
      RAISE EXCEPTION 'A shipped order needs an inventory adjustment before reopening';
    END IF;
  END IF;

  IF COALESCE(NEW.fulfillment_status, 'pending') IN ('shipped', 'fulfilled') AND NOT was_shipped THEN
    IF NEW.order_status <> 'paid' THEN
      RAISE EXCEPTION 'Only paid orders may be marked shipped';
    END IF;
    INSERT INTO public.inventory_movements (color, quantity_delta, movement_type, reference_key, notes)
    SELECT entry.key, -(entry.value #>> '{}')::INTEGER, 'shipment',
           'shipment:' || NEW.id::text || ':' || entry.key,
           NEW.channel || ' order ' || COALESCE(NEW.external_order_id, NEW.stripe_checkout_session_id)
    FROM jsonb_each(NEW.color_counts) AS entry
    ON CONFLICT (reference_key) DO NOTHING;

    INSERT INTO public.paper_movements (color, quantity_delta, movement_type, reference_key, notes)
    SELECT entry.key, -(entry.value #>> '{}')::INTEGER, 'shipment',
           'paper-shipment:' || NEW.id::text || ':' || entry.key,
           NEW.channel || ' order ' || COALESCE(NEW.external_order_id, NEW.stripe_checkout_session_id)
    FROM jsonb_each(NEW.roll_counts) AS entry
    ON CONFLICT (reference_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Stamp shipped_at the first time an order becomes shipped.
CREATE OR REPLACE FUNCTION public.stamp_sentimo_shipped_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.fulfillment_status, 'pending') IN ('shipped', 'fulfilled') AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preorders_stamp_shipped_at ON public.preorders;
CREATE TRIGGER preorders_stamp_shipped_at
  BEFORE INSERT OR UPDATE OF fulfillment_status ON public.preorders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_sentimo_shipped_at();

-- Opening paper stock (2026-10-07): 39 white rolls (13 packs) and 12 rolls of each
-- of the six colors (12 Sweet packs and 12 Bright packs).
INSERT INTO public.paper_movements
  (color, quantity_delta, movement_type, reference_key, notes)
VALUES
  ('white', 39, 'opening', 'paper-opening:2026-10-07:white', 'Starting paper inventory'),
  ('pink', 12, 'opening', 'paper-opening:2026-10-07:pink', 'Starting paper inventory'),
  ('purple', 12, 'opening', 'paper-opening:2026-10-07:purple', 'Starting paper inventory'),
  ('yellow', 12, 'opening', 'paper-opening:2026-10-07:yellow', 'Starting paper inventory'),
  ('mint', 12, 'opening', 'paper-opening:2026-10-07:mint', 'Starting paper inventory'),
  ('blue', 12, 'opening', 'paper-opening:2026-10-07:blue', 'Starting paper inventory'),
  ('orange', 12, 'opening', 'paper-opening:2026-10-07:orange', 'Starting paper inventory')
ON CONFLICT (reference_key) DO NOTHING;

COMMIT;
