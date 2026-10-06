-- Assign order numbers only when an insert commits. Stripe retries may otherwise
-- consume sequence numbers even when the duplicate insert fails.
BEGIN;

LOCK TABLE public.preorders IN ACCESS EXCLUSIVE MODE;

-- Keep existing customer-facing numbers, including 00017, which was already
-- included in a confirmation email. The next committed order will be 00018.

ALTER TABLE public.preorders ALTER COLUMN order_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.assign_preorder_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  next_number INTEGER;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize allocations across transactions. A rolled-back insert leaves no gap.
  PERFORM pg_advisory_xact_lock(20261005, 10);
  SELECT COALESCE(MAX(order_number::INTEGER), 9) + 1
    INTO next_number FROM public.preorders;
  IF next_number > 99999 THEN
    RAISE EXCEPTION 'Sentimo order number limit reached';
  END IF;
  NEW.order_number := LPAD(next_number::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preorders_assign_order_number ON public.preorders;
CREATE TRIGGER preorders_assign_order_number
  BEFORE INSERT ON public.preorders
  FOR EACH ROW EXECUTE FUNCTION public.assign_preorder_order_number();

COMMIT;
