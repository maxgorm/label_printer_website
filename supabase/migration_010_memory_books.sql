-- Memory Books (2026-11): branded A6 kraft notebooks sold as an accessory.
--   Memory Book       (MEMORY-BOOK-1) = 1 notebook
--   Memory Book Duo   (MEMORY-BOOK-2) = 2 notebooks
-- Both variants draw from ONE physical notebook stock, tracked per book (not per variant)
-- in book_movements, with the book_stock view for availability.
--
-- Orders store:
--   memory_books       JSONB    {"single":1,"duo":2}   units bought per variant
--   memory_book_count  INTEGER  5                       physical notebooks (drives stock)
-- cart_items also gets {"type":"book","variant":"duo","sku":"MEMORY-BOOK-2","quantity":1,"books":2}.
--
-- Apply after migration_009, BEFORE deploying the Memory Book website code. Safe to re-run.
BEGIN;

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS memory_books JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_book_count INTEGER NOT NULL DEFAULT 0;

-- Physical notebooks in a memory_books object, or NULL when the object is invalid.
CREATE OR REPLACE FUNCTION public.sentimo_memory_book_count(units JSONB)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item RECORD; total INTEGER := 0;
BEGIN
  IF units IS NULL OR jsonb_typeof(units) <> 'object' THEN
    RETURN NULL;
  END IF;
  FOR item IN SELECT key, value FROM jsonb_each(units) LOOP
    IF item.key NOT IN ('single', 'duo')
      OR jsonb_typeof(item.value) <> 'number'
      OR item.value::text !~ '^[1-9][0-9]*$' THEN
      RETURN NULL;
    END IF;
    total := total + (item.value #>> '{}')::INTEGER * CASE item.key WHEN 'duo' THEN 2 ELSE 1 END;
  END LOOP;
  RETURN total;
END;
$$;

-- memory_book_count must always equal the books in memory_books, so stock is never
-- counted twice or missed. For a manual order, set both, e.g. '{"duo":1}' and 2.
ALTER TABLE public.preorders DROP CONSTRAINT IF EXISTS preorders_memory_books_valid;
ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_memory_books_valid
  CHECK (memory_book_count = public.sentimo_memory_book_count(memory_books));

-- An order holds printers, paper, Memory Books, or any mix. Accessory-only orders have
-- empty color_counts but must contain paper rolls or books.
ALTER TABLE public.preorders DROP CONSTRAINT IF EXISTS preorders_color_counts_valid;
ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_color_counts_valid CHECK (
    public.valid_sentimo_color_counts(color_counts)
    OR (color_counts = '{}'::jsonb AND (roll_counts <> '{}'::jsonb OR memory_book_count > 0))
  );

COMMENT ON COLUMN public.preorders.memory_books IS
  'Memory Book units per variant: {"single":n,"duo":n}. A duo unit is two notebooks.';
COMMENT ON COLUMN public.preorders.memory_book_count IS
  'Physical Memory Book notebooks in the order (single = 1, duo = 2 per unit). Drives book_stock.';

-- Notebook stock ledger (one row per movement, like paper_movements). Count books, not packs.
CREATE TABLE IF NOT EXISTS public.book_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('opening', 'restock', 'giveaway', 'shipment', 'return', 'damage', 'adjustment')),
  reference_key TEXT NOT NULL UNIQUE,
  notes TEXT
);

ALTER TABLE public.book_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.book_movements;
CREATE POLICY "Service role full access" ON public.book_movements
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- One row: notebooks on the shelf, sold but not shipped, and still available to sell.
CREATE OR REPLACE VIEW public.book_stock WITH (security_invoker = true) AS
WITH physical AS (
  SELECT COALESCE(SUM(quantity_delta), 0)::INTEGER AS on_hand FROM public.book_movements
),
reserved AS (
  SELECT COALESCE(SUM(memory_book_count), 0)::INTEGER AS units
  FROM public.preorders
  WHERE order_status IN ('paid', 'partially_refunded')
    AND COALESCE(fulfillment_status, 'pending') NOT IN ('fulfilled', 'shipped', 'cancelled')
)
SELECT physical.on_hand AS physical_on_hand,
       reserved.units AS sold_unshipped,
       physical.on_hand - reserved.units AS available_to_sell
FROM physical CROSS JOIN reserved;

REVOKE ALL ON public.book_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.book_stock TO service_role;
GRANT ALL ON public.book_movements TO service_role;

-- Shipping an order records printer, paper roll, and notebook movements, once each.
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

    IF NEW.memory_book_count > 0 THEN
      INSERT INTO public.book_movements (quantity_delta, movement_type, reference_key, notes)
      VALUES (-NEW.memory_book_count, 'shipment', 'book-shipment:' || NEW.id::text,
              NEW.channel || ' order ' || COALESCE(NEW.external_order_id, NEW.stripe_checkout_session_id))
      ON CONFLICT (reference_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

-- REQUIRED before Memory Books can sell: record the notebooks you have on hand.
-- Checkout blocks Memory Books when book_stock.available_to_sell is too low, and it
-- starts at 0. Replace N with the number of physical notebooks (count books, not duos):
--
-- INSERT INTO public.book_movements (quantity_delta, movement_type, reference_key, notes)
-- VALUES (N, 'opening', 'book-opening:2026-11-25', 'Starting Memory Book inventory')
-- ON CONFLICT (reference_key) DO NOTHING;
--
-- SELECT * FROM public.book_stock;
