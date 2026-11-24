-- Cart checkout (2026-11): one website order can now hold several printer lines (for
-- example a pink/white 2-Pack plus a black single printer) along with paper packs.
-- color_counts, paper_bundles, and roll_counts still drive stock and need no change;
-- this adds a per-line record of what the customer put in their cart, for packing.
--
-- cart_items example:
--   [{"type":"printer","product":"duo","slug":"sentimo-2-pack","colors":["pink","white"],"quantity":1},
--    {"type":"printer","product":"single","slug":"sentimo-single","colors":["black"],"quantity":2},
--    {"type":"paper","bundle":"classic","quantity":2},
--    {"type":"paper","bundle":"dreamy","quantity":1,"addon":true}]
--
-- For a cart that mixes single printers and 2-Packs, product_slug is 'sentimo-mixed',
-- quantity is the number of printer packages, and unit_price is NULL.
--
-- Safe to apply while the site is live: the webhook saves orders without cart_items
-- until this column exists. Apply after migration_008.
BEGIN;

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS cart_items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.preorders DROP CONSTRAINT IF EXISTS preorders_cart_items_is_array;
ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_cart_items_is_array CHECK (jsonb_typeof(cart_items) = 'array');

COMMENT ON COLUMN public.preorders.cart_items IS
  'Website cart lines: printers (product, colors, quantity) and paper packs (bundle, quantity, addon). Empty for orders placed before carts.';

COMMIT;
