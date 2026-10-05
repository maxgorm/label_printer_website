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

---

## 2. Supabase setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor
3. Run the migration in `supabase/migration_001_preorders.sql`
4. Run `supabase/migration_002_orders_inventory.sql` for color counts and inventory
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

To verify production without buying: start a **new** checkout, choose the $49
2-pack with quantity 1 and no discount, and enter a valid Michigan delivery
address. Once Stripe recalculates, expect $2.94 tax and $51.94 total. Repeat for
the $29 single ($1.74 tax, $30.74 total), another color, and an address in a state
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
products.single.unit_price_cents: 2900, // Single printer price (in cents)
products.duo.unit_price_cents: 4900,    // 2-pack price (in cents)
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
