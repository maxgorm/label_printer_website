-- Unified order colors and stock ledger. Apply before enabling the Stripe webhook.
ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS color_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_email_amount INTEGER;

-- TikTok orders may not have Stripe IDs or a buyer email.
ALTER TABLE public.preorders
  ALTER COLUMN stripe_checkout_session_id DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN unit_price DROP NOT NULL,
  ALTER COLUMN total_amount DROP NOT NULL;

ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_channel_valid CHECK (channel IN ('web', 'tiktok')),
  ADD CONSTRAINT preorders_source_valid CHECK (
    (channel = 'web' AND stripe_checkout_session_id IS NOT NULL)
    OR (channel = 'tiktok' AND external_order_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_preorders_channel_external_order
  ON public.preorders (channel, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.valid_sentimo_color_counts(counts JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item RECORD;
BEGIN
  IF counts IS NULL OR jsonb_typeof(counts) <> 'object' OR counts = '{}'::jsonb THEN
    RETURN FALSE;
  END IF;
  FOR item IN SELECT key, value FROM jsonb_each(counts) LOOP
    IF item.key NOT IN ('white', 'pink', 'black')
      OR jsonb_typeof(item.value) <> 'number'
      OR item.value::text !~ '^[1-9][0-9]*$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_color_counts_valid
  CHECK (public.valid_sentimo_color_counts(color_counts));

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  color TEXT NOT NULL CHECK (color IN ('white', 'pink', 'black')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('opening', 'giveaway', 'shipment', 'return', 'damage', 'adjustment')),
  reference_key TEXT NOT NULL UNIQUE,
  notes TEXT
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.inventory_movements
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE VIEW public.inventory_stock WITH (security_invoker = true) AS
WITH colors(color) AS (VALUES ('white'), ('pink'), ('black')),
physical AS (
  SELECT color, SUM(quantity_delta)::INTEGER AS on_hand
  FROM public.inventory_movements GROUP BY color
),
reserved AS (
  SELECT entry.key AS color, SUM((entry.value #>> '{}')::INTEGER)::INTEGER AS units
  FROM public.preorders AS orders
  CROSS JOIN LATERAL jsonb_each(orders.color_counts) AS entry
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

REVOKE ALL ON public.inventory_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_stock TO service_role;
GRANT ALL ON public.inventory_movements TO service_role;

-- Marking an order shipped/fulfilled records the physical stock movement once.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preorders_record_shipment ON public.preorders;
CREATE TRIGGER preorders_record_shipment
  AFTER INSERT OR UPDATE OF fulfillment_status ON public.preorders
  FOR EACH ROW EXECUTE FUNCTION public.record_sentimo_shipment();

-- Opening units and the two creator/giveaway units supplied on 2026-10-05.
INSERT INTO public.inventory_movements
  (color, quantity_delta, movement_type, reference_key, notes)
VALUES
  ('white', 400, 'opening', 'opening:2026-10-05:white', 'Starting inventory'),
  ('pink', 400, 'opening', 'opening:2026-10-05:pink', 'Starting inventory'),
  ('black', 200, 'opening', 'opening:2026-10-05:black', 'Starting inventory'),
  ('white', -1, 'giveaway', 'giveaway:before-2026-10-05:white', 'Creator/giveaway'),
  ('pink', -1, 'giveaway', 'giveaway:before-2026-10-05:pink', 'Creator/giveaway')
ON CONFLICT (reference_key) DO NOTHING;
