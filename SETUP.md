# Sentimo Pre-Order System — Setup Guide

## Architecture overview

| Layer | Tech |
|---|---|
| Frontend | Static HTML + Tailwind CSS (CDN) + Vanilla JS |
| API | Vercel Serverless Functions (Node.js) |
| Payments | Stripe Checkout |
| Database | Supabase (Postgres) |
| Email | Resend |
| Hosting | Vercel |

---

## 1. Environment variables

Copy `.env.example` and fill in real values. Set these as Vercel Environment Variables:

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (not currently used server-side, but good to have) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe dashboard |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (not the anon key) |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_AUDIENCE_ID` | Resend audience ID for mailing list subscribers |
| `ADMIN_API_KEY` | A secure random string for admin-only API endpoints |
| `SHIPMENT_WEBHOOK_SECRET` | A long random string. The Supabase Database Webhook sends it in the `x-webhook-secret` header to `/api/shipment-notify` |

---

## 2. Supabase setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor
3. Run the migration in `supabase/migration_001_preorders.sql`
4. Run `supabase/migration_002_orders_inventory.sql` for color counts and inventory
4a. Run `migration_003`, then `migration_004` (order numbers), then `migration_005_paper_and_tracking.sql` (thermal paper stock, shipping charge, tracking columns)
5. Copy your project URL and service role key into env vars

---

## 3. Stripe setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your API keys from **Developers → API keys**
3. Create a webhook endpoint:
   - URL: `https://your-domain.com/api/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `charge.refunded`
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`
5. Enable the event destination after deploying the updated webhook

### Stripe Tax

The reserve form in `public/index.html` sends the pack, quantity, and colors via
`public/assets/js/preorder.js` to `POST /api/create-checkout`. That endpoint is the
only Checkout Session creation path. It uses Stripe 17.7.0 and inline
`price_data` / `product_data`, rather than saved Product/Price IDs or Payment Links.
No static Payment Links are referenced by the website.

Each new session enables `automatic_tax.enabled`. Each inline price specifies
`tax_behavior: 'exclusive'` so applicable tax is added to the listed subtotal.
Each inline product uses `api/_config.js`'s `product_tax_code`, currently
`txcd_34020027` (**Consumer Electronics**, physical devices for personal use),
verified against [Stripe's tax code list](https://docs.stripe.com/tax/tax-codes).
This overrides the account preset for both packs and all colors. The existing
inline product/price creation strategy is preserved; no separate catalog products
or prices are provisioned by this change.

The existing US shipping address collection remains enabled. Stripe Tax uses the
delivery address entered in Checkout for these guest purchases, then applies
the account's active registrations and tax rules. No rate is hard-coded.
See [Stripe's Checkout tax guide](https://docs.stripe.com/tax/checkout/page).

In the **live-mode** Stripe Dashboard, confirm Tax setup is complete (business
origin address and an active Michigan registration with the correct start date).
Change the preset category in **Settings → Tax** from Electronically Supplied
Services to Consumer Electronics for consistency with Sentimo's physical goods.
This preset change is not required by the corrected website path because its
products now carry an explicit category. Existing saved products, previously
created sessions, and external Payment Links are not modified. If you distribute
Payment Links elsewhere, enable automatic tax and correct their product category
and price tax behavior separately. No saved Product ID is used by this website.

To verify production without buying: start a **new** checkout, choose the $49.99
2-pack with quantity 1 and no discount, and enter a valid Michigan delivery
address. Once Stripe recalculates, expect the tax Stripe shows for $49.99 (and free shipping). Repeat for
the $29.99 single, another color, and an address in a state
without an active registration. Let Stripe decide tax in that state. Open the
promotion-code control and, if available, apply an existing valid code; tax should
recalculate on the discounted taxable subtotal. Stop before submitting payment.
In Stripe's session/API request details, verify `automatic_tax.enabled: true`,
the physical product tax code, exclusive tax behavior, and collected shipping
location. Tax can remain pending until a complete delivery address is entered.

Success redirects to `/order-confirmed.html?session_id=...`; cancellation returns
to `/#reserve`. The signed `checkout.session.completed` webhook stores Stripe's
`amount_total` (including tax) and shipping details in Supabase and uses that total
in the confirmation email. These handlers remain unchanged.

Run `npm test` to verify the real SDK's serialized session requests for both packs,
every color combination, the default offer, shipping, promo-code eligibility,
prices, metadata, and redirects. These are offline contract tests, not proof of
live registration state or a live tax calculation. Use a separately configured
Stripe test-mode account for end-to-end test payments; never test by charging a
real card.

---

## 4. Resend setup

1. Create a Resend account at [resend.com](https://resend.com)
2. Verify your sending domain (`sentimonotes.com`)
3. Create an API key
4. The webhook handler sends confirmations from `noreply@sentimonotes.com` and directs questions to `support@sentimonotes.com`. Verify the `sentimonotes.com` domain in the Resend account that owns `RESEND_API_KEY`.
5. For the mailing list subscriber flow (existing), set up an Audience and copy the ID

See `INVENTORY.md` for stock and fulfillment handling.

---

## 5. Deploy to Vercel

1. Connect this repo to Vercel
2. The `vercel.json` handles routing — no build step needed
3. Add all environment variables in Vercel project settings
4. Deploy

---

## 6. Local development

```bash
npm install
npx serve public
```

Note: The API endpoints require Vercel's serverless runtime. For local testing of the full flow, use `vercel dev`.

For Stripe webhook testing locally, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/webhook
```

---

## Changing price, date, or refund copy

All configurable values live in **`api/_config.js`**:

```js
products.single.unit_price_cents: 2999, // Single printer price (in cents)
products.duo.unit_price_cents: 4999,    // 2-pack price (in cents)
paper_bundles.*.price_cents: 799 / 899, // Classic / Sweet and Bright (in cents)
paper_addon_price_cents: 499,           // $4.99 add-on, 1 per order, printer orders only
shipping_flat_cents: 499,               // under the free-shipping threshold
free_shipping_threshold_cents: 2500,    // pre-tax subtotal for free shipping
expected_ship_label: 'Fall 2026', // Change ship date
refund_message: '...',         // Change refund copy
```

The checkout defaults to the 2-pack and accepts `product: 'single'` or `product: 'duo'` from the order form. Stripe Checkout receives the selected product name, description, price, and quantity from this catalog; the webhook stores the selected product and unit price in Supabase.

After updating `_config.js`, also update the corresponding copy in:
- `public/index.html` — hero microcopy, trust block, reserve section, FAQ
- `public/preorder-policy.html` — policy page copy
- `public/order-confirmed.html` — confirmation page

---

## Image asset placeholders

Replace these placeholders with real product/lifestyle images:

| Location in HTML | Suggested asset |
|---|---|
| Hero section `<img>` | `/assets/IMG_4321.JPG` (already in use) |
| Gallery slot 1 | Lifestyle photo (couple with note) |
| Gallery slot 2 | Product angle shot (pink Sentimo) |
| Gallery slot 3 | Printed note close-up |

Look for `<!-- TODO: Replace with` comments in `index.html`.

---

## QA Checklist

- [ ] Homepage loads with all sections (hero, trust, how-it-works, benefits, gallery, what's included, reserve, email capture, FAQ, footer)
- [ ] Announcement banner appears and can be dismissed
- [ ] Pre-order disclosure is visible in 3 places: near hero CTA, reserve section, pre-order policy page
- [ ] Checkbox must be checked to enable Pre-Order Now button
- [ ] Quantity selector works (1–10)
- [ ] Clicking Pre-Order Now creates a Stripe Checkout session and redirects
- [ ] Stripe Checkout shows correct product, quantity, and pre-order custom text
- [ ] Successful payment redirects to `/order-confirmed.html`
- [ ] Confirmation page shows pre-order reminder and next steps
- [ ] Webhook creates a row in the `preorders` Supabase table
- [ ] Confirmation email is sent via Resend
- [ ] Refunding via Stripe dashboard triggers webhook → updates DB row → sends refund email
- [ ] Pre-Order Policy page renders correctly at `/preorder-policy.html`
- [ ] Terms of Service page references pre-order policy
- [ ] FAQ accordion opens/closes properly
- [ ] Mobile responsiveness on all pages
- [ ] Email capture (mailing list) form still works
- [ ] Footer links all resolve correctly
- [ ] Social links open in new tab

---

## Thermal paper

Paper is sold in packs of 3 rolls: **Classic** (3 white, $7.99), **Sweet** (pink, purple, yellow, $8.99) and **Bright** (mint, blue, orange, $8.99). They can be bought on their own (the `#paper` section) or optionally in the printer order form at full price. A printer order with no paper gets a pop-up offering **one** pack for **$4.99** per order. The server only accepts that price when the order contains a printer.

In Stripe each paper pack is its own line item (the add-on is labelled "printer add-on price" and has `paper_addon: true` in its product metadata). Session metadata carries `paper_bundles`, `paper_addon`, `paper_packs` and `paper_summary`. Paper-only orders have `product_key: paper`.

Shipping: $4.99, or free when the pre-tax subtotal is $25 or more (printer orders are always above that). Stripe receives a fixed-amount shipping rate with the shipping tax code; confirm Stripe Tax settings if you want shipping taxed differently.

Paper orders ship with the printers (Fall 2026). Each order shows `paper_bundles` and per-color `roll_counts` in Supabase; `paper_stock` shows `physical_on_hand`, `sold_unshipped` and `available_to_sell` per roll color. Checkout refuses a paper selection that exceeds `available_to_sell`.

## Shipping notifications

1. Apply `migration_005` (adds `tracking_carrier`, `tracking_number`, `shipped_at`, `shipping_email_sent_at`).
2. Set `SHIPMENT_WEBHOOK_SECRET` in Vercel.
3. In Supabase go to **Database → Webhooks → Create**: table `preorders`, event **Update**, type HTTP Request, `POST https://<your-domain>/api/shipment-notify`, and add the header `x-webhook-secret` with the same secret.
4. To ship an order, paste the tracking number into `tracking_number` (optionally set `tracking_carrier` to `usps`, `ups` or `fedex`; it is detected otherwise) and set `fulfillment_status` to `shipped`. The customer gets one email with a tracking link, and stock is deducted by the existing trigger. Any order of the two edits works; the email goes out once both are present.

## International shipping

Customers choose a **Ship to** country on the order form and in the paper section before Stripe. Each Checkout Session is locked to that one country (`shipping_address_collection.allowed_countries`), so the shipping rate always matches the address Stripe collects.

- **United States** (all 50 states, DC, Alaska, Hawaii, territories and military addresses): $4.99, or free at $25+ before tax.
- **Everywhere else**: a destination rate by zone, never the US flat or free rate, and no free-shipping threshold. Rates, zones and the country list are in `api/_shipping.js` (`ZONES`, `INTERNATIONAL_RATES_CENTS`). **The rates are estimates. Compare them with Pirate Ship (USPS international) for your package weights and edit them before relying on them.** `light` = paper-only order, `standard` = order with a printer.
- Import duties, taxes and customs fees are charged by the destination country and are not collected at checkout. The checkout message and confirmation email say so.
- The webhook records the shipping country and writes `CHECK SHIPPING` in the order notes if the address country ever differs from the country the rate was charged for.
- `GET /api/shipping-options` feeds the country list to the order form.
- Not served: North Korea, Iran, Cuba, Syria, Russia, Belarus and other embargoed or USPS-suspended destinations. Add or remove countries in `ZONES`; every code must be one Stripe Checkout supports.
- Pirate Ship needs a customs declaration for each international label. Check that the printer's battery is allowed to ship to each destination with USPS before enabling a country for printers.
