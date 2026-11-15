-- New paper supplier (2026-11): the Sweet and Bright packs are retired and replaced by
-- Dreamy (5 rolls: white, lavender, yellow, pink, blue). This adds the "lavender" roll
-- color to every place that lists roll colors. Old colors stay valid so past orders
-- and stock history keep working. Apply after migration_006.
BEGIN;

CREATE OR REPLACE FUNCTION public.valid_sentimo_roll_counts(counts JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item RECORD;
BEGIN
  IF counts IS NULL OR jsonb_typeof(counts) <> 'object' THEN
    RETURN FALSE;
  END IF;
  FOR item IN SELECT key, value FROM jsonb_each(counts) LOOP
    IF item.key NOT IN ('white', 'lavender', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange')
      OR jsonb_typeof(item.value) <> 'number'
      OR item.value::text !~ '^[1-9][0-9]*$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

ALTER TABLE public.paper_movements DROP CONSTRAINT IF EXISTS paper_movements_color_check;
ALTER TABLE public.paper_movements
  ADD CONSTRAINT paper_movements_color_check
  CHECK (color IN ('white', 'lavender', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange'));

CREATE OR REPLACE VIEW public.paper_stock WITH (security_invoker = true) AS
WITH colors(color) AS (VALUES ('white'), ('lavender'), ('pink'), ('purple'), ('yellow'), ('mint'), ('blue'), ('orange')),
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

COMMIT;

-- Checkout blocks a pack when any of its roll colors is short, so record the new
-- supplier's rolls before selling Dreamy (lavender starts at 0). Replace N with the
-- number of rolls received and change the date in reference_key, for example:
--
-- INSERT INTO public.paper_movements (color, quantity_delta, movement_type, reference_key, notes)
-- VALUES
--   ('white',    N, 'adjustment', 'paper-restock:2026-11-15:white',    'Dreamy supplier rolls'),
--   ('lavender', N, 'adjustment', 'paper-restock:2026-11-15:lavender', 'Dreamy supplier rolls'),
--   ('yellow',   N, 'adjustment', 'paper-restock:2026-11-15:yellow',   'Dreamy supplier rolls'),
--   ('pink',     N, 'adjustment', 'paper-restock:2026-11-15:pink',     'Dreamy supplier rolls'),
--   ('blue',     N, 'adjustment', 'paper-restock:2026-11-15:blue',     'Dreamy supplier rolls');
