-- Reserve 00001-00009 for tester orders. Number real orders from 00010.
BEGIN;

LOCK TABLE public.preorders IN ACCESS EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS public.preorder_order_number_seq
  AS INTEGER MINVALUE 10 MAXVALUE 99999 START WITH 10;

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Assign existing orders by purchase time, then by row creation and ID for ties.
WITH numbered AS (
  SELECT id,
         row_number() OVER (
           ORDER BY COALESCE(source_created_at, created_at), created_at, id
         ) + 9 AS number
  FROM public.preorders
  WHERE order_number IS NULL
)
UPDATE public.preorders AS p
SET order_number = lpad(numbered.number::TEXT, 5, '0')
FROM numbered
WHERE p.id = numbered.id;

SELECT setval(
  'public.preorder_order_number_seq',
  COALESCE((SELECT max(order_number::INTEGER) FROM public.preorders), 10),
  EXISTS (SELECT 1 FROM public.preorders WHERE order_number IS NOT NULL)
);

ALTER TABLE public.preorders
  ALTER COLUMN order_number SET DEFAULT lpad(nextval('public.preorder_order_number_seq')::TEXT, 5, '0'),
  ALTER COLUMN order_number SET NOT NULL;

ALTER SEQUENCE public.preorder_order_number_seq
  OWNED BY public.preorders.order_number;

ALTER TABLE public.preorders
  ADD CONSTRAINT preorders_order_number_format
  CHECK (order_number ~ '^[0-9]{5}$' AND order_number::INTEGER >= 10),
  ADD CONSTRAINT preorders_order_number_unique UNIQUE (order_number);

COMMIT;
