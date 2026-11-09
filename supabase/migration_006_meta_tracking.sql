-- Meta Conversions API bookkeeping and lightweight attribution reporting.
-- Purely additive: the webhook works without it (it falls back to Meta's event_id
-- deduplication) but cannot record "already sent" or attribution until it is applied.
BEGIN;

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS meta_purchase_event_id text,
  ADD COLUMN IF NOT EXISTS meta_purchase_sent_at timestamptz,
  -- Merchandise revenue after discounts, excluding tax and shipping (cents).
  ADD COLUMN IF NOT EXISTS meta_purchase_value_cents integer,
  -- utm_*, referral_code, landing_path, meta_click, consent (no personal data).
  ADD COLUMN IF NOT EXISTS attribution jsonb;

-- Orders and merchandise revenue by campaign / creator code. Only orders whose buyer
-- consented to advertising measurement carry attribution. UTM data alone does not
-- prove ad-level attribution; use Meta Ads Manager for that.
CREATE OR REPLACE VIEW public.meta_attribution_report AS
SELECT
  COALESCE(attribution->>'utm_source', '(none)')   AS utm_source,
  COALESCE(attribution->>'utm_medium', '(none)')   AS utm_medium,
  COALESCE(attribution->>'utm_campaign', '(none)') AS utm_campaign,
  COALESCE(attribution->>'referral_code', '')      AS referral_code,
  COUNT(*)                                         AS orders,
  SUM(meta_purchase_value_cents) / 100.0           AS merchandise_revenue,
  ROUND(AVG(meta_purchase_value_cents) / 100.0, 2) AS avg_order_value,
  COUNT(*) FILTER (WHERE (attribution->>'meta_click')::boolean) AS orders_with_meta_click
FROM public.preorders
WHERE meta_purchase_sent_at IS NOT NULL
  AND order_status IN ('paid', 'partially_refunded')
GROUP BY 1, 2, 3, 4;

COMMIT;
