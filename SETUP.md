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
4. Copy your project URL and service role key into env vars

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

---

## 4. Resend setup

1. Create a Resend account at [resend.com](https://resend.com)
2. Verify your sending domain (`sentimonotes.com`)
3. Create an API key
4. The webhook handler sends from `orders@sentimonotes.com` — make sure this is verified
5. For the mailing list subscriber flow (existing), set up an Audience and copy the ID

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
unit_price_cents: 3900,        // Change price (in cents)
expected_ship_label: 'summer 2026', // Change ship date
refund_message: '...',         // Change refund copy
```

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
