# Sentimo orders and inventory

The Supabase `preorders` table stores both website and TikTok orders. `order_number` is the five-digit seller order number, starting at `00010`; `00001`-`00009` are reserved for testers. Supabase automatically assigns the next number on insert. `channel` identifies the source, `color_counts` contains the number of physical printers by color, and `quantity` is the number of purchased packages. The `inventory_stock` view shows `physical_on_hand`, `sold_unshipped`, and `available_to_sell` for each color.

```sql
SELECT * FROM public.inventory_stock ORDER BY color;
SELECT order_number, created_at, channel, external_order_id, email, quantity, color_counts,
       order_status, fulfillment_status
FROM public.preorders ORDER BY created_at DESC;
```

The opening balance is 400 white, 400 pink, and 200 black. Two creator/giveaway units are recorded as movements: one white and one pink. The `inventory_stock` view calculates current availability from live orders and movements, so use it for the latest counts.

When a paid order ships, change its `fulfillment_status` to `shipped` or `fulfilled`. A database trigger records a negative physical movement for each color once; the order stops counting as unshipped. Do not add a second manual shipment movement for the same order. To record another giveaway, damage, return, or correction, insert a row in `inventory_movements` with a unique `reference_key` and signed `quantity_delta`.

Website orders are inserted from the Stripe `checkout.session.completed` webhook. An insert failure returns an error to Stripe so it can retry. Customer confirmation emails come from `noreply@sentimonotes.com` through Resend after the order is saved. Historical backfilled orders are not emailed by the backfill.

TikTok Shop can use the same table and stock view, but an automatic feed needs a TikTok Shop Partner Center app, seller authorization, and the Order Information API scope. Until that connection exists, TikTok orders must be entered with `channel = 'tiktok'`, the exact TikTok `external_order_id`, the SKU-derived `color_counts`, and the correct order and fulfillment statuses. The database enforces one row per TikTok order ID. Do not treat a paid TikTok order as a website Stripe checkout.

The migrations are `supabase/migration_002_orders_inventory.sql`, `supabase/migration_003_order_numbers.sql`, and `supabase/migration_004_gapless_order_numbers.sql`, applied in that order. The last migration assigns numbers in a database transaction so failed or duplicate inserts do not create gaps. Keep Stripe, Supabase service-role, and Resend keys only in Vercel environment variables; never place them in this repository.
