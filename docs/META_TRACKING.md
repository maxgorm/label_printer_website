# Meta Pixel + Conversions API (Sentimo)

## Architecture
```
Browser (tracking.js)                    Vercel API                         Meta
 consent check -> Pixel PageView/ViewContent
 click Order -> POST /api/create-checkout (+attribution if consented)
                 -> Stripe Checkout Session, attribution in session.metadata
                 <- {url, tracking:{event_id, value, contents}}
 InitiateCheckout (eventID = checkout_<session>) ------------------------------> Pixel
 redirect to Stripe -> pays -> /order-confirmed.html?session_id=cs_...
 GET /api/order-purchase (Stripe-verified, paid only) -> browser Purchase ------> Pixel (eventID purchase_<session>)
Stripe -> POST /api/webhook (signature verified) -> order saved -> CAPI Purchase -> Graph API (same event_id)
```
- Stripe is authoritative: Purchase is only sent for `payment_status = paid`
  (`checkout.session.completed` and `checkout.session.async_payment_succeeded`; checkout is card-only today).
- One order = one event id `purchase_<checkout session id>`, reused by browser, server and every retry.
- Value = merchandise after discounts, excluding tax and shipping (`amount_subtotal - amount_discount`).
- Product IDs = slugs: `sentimo-single`, `sentimo-2-pack`, `paper-classic`, `paper-sweet`, `paper-bright`.
- No cart exists on the site, so there is no AddToCart event. Funnel events are browser-only; only Purchase is dual-channel.
- Creator commission logic is untouched (none exists in this repo). Referral codes (`?ref=`) are stored separately from Meta data.

## Changed files
| File | Purpose |
|---|---|
| `public/assets/js/tracking.js` | Consent banner/logic, Pixel loader, attribution capture, `window.SentimoTrack` |
| `public/*.html`, `gifts/*.html` | Load `tracking.js` (one deferred tag) |
| `public/assets/js/preorder.js`, `paper.js` | ViewContent, send attribution, InitiateCheckout after session creation |
| `public/order-confirmed.html` | Browser Purchase (once per order per browser) |
| `public/privacy.html` | New section 4A + opt-out button |
| `api/_meta.js` | Hashing, attribution validation, Purchase payload, CAPI client with retries |
| `api/create-checkout.js` | Stores consented attribution in session metadata; returns tracking payload |
| `api/webhook.js` | Sends CAPI Purchase after order is saved; durable sent flag |
| `api/order-purchase.js` | Stripe-verified purchase details for the browser event |
| `supabase/migration_006_meta_tracking.sql` | Sent flag, value, attribution columns, `meta_attribution_report` view |
| `vercel.json` | CSP allows `connect.facebook.net` / `www.facebook.com` |
| `tests/meta.test.js` | Unit tests |

## Configuration checklist
1. Meta Events Manager: use the existing dataset/Pixel or create one; note the **ID**.
2. Set `META_PIXEL_ID` in `public/assets/js/tracking.js` (top of file) and as a Vercel env var.
3. Events Manager > dataset > Settings > Conversions API > generate access token -> Vercel `META_CAPI_TOKEN` (Production + Preview).
4. Optional `META_TEST_EVENT_CODE` (Preview only!) and `META_API_VERSION`.
5. Run `supabase/migration_006_meta_tracking.sql` in Supabase.
6. Stripe webhook endpoint: add `checkout.session.async_payment_succeeded` (optional while checkout is card-only).
7. Meta Business Settings > Brand Safety > Domains: verify `sentimonotes.com` (DNS TXT or meta tag).
8. Connect the dataset to the ad account (Business Settings > Data sources > Datasets > Assign assets).
9. Automatic Advanced Matching is ON for all fields (owner decision, Nov 8 2026) and is disclosed in privacy.html section 4A. Note `tracking.js` sets `autoConfig` false, which may stop the Pixel from performing automatic matching; remove that line if matching is wanted.
10. Redeploy, then confirm events in Test events (use a test event code first).

## Events
| Event | Source | Trigger | Key params |
|---|---|---|---|
| PageView | Pixel | Page load after consent | none (eventID `pv_*`) |
| ViewContent | Pixel | Order section 30% visible, once per load | content_ids, content_name, content_type, contents, value, currency |
| InitiateCheckout | Pixel | Stripe session created successfully, id `checkout_<session>` | value (pre-discount merchandise), currency, content_ids, contents, num_items |
| Purchase | CAPI + Pixel | Paid Stripe session, id `purchase_<session>` | value, currency, content_ids, contents, num_items, hashed user_data, fbp/fbc/ip/UA |

## Consent
- EEA/UK/CH and unknown locations: banner, nothing loads until Accept.
- Elsewhere: on by default; opt out via the Privacy page button; Global Privacy Control = opted out.
- Checkout records consent in Stripe metadata; the webhook sends **no** CAPI event without `meta_consent=1`.
- Existing Google Analytics tag is unchanged and not covered by this banner.
- Legal assumptions to review with counsel: US opt-out model, CCPA/state "sharing" disclosures, GDPR basis, policy wording.

## Meta Ads Manager
Create campaign > objective **Sales** > conversion location **Website** > dataset = Sentimo > conversion event **Purchase** > optimize for conversions. Wait until Purchase shows as "Active" in Events Manager (a handful of events) before launching. Use Value optimization later once purchases accumulate.

## Monitoring
- Events Manager > Overview: Browser and Server both listed for Purchase with "Deduplicated" shown.
- Diagnostics tab: warnings on match quality, missing parameters, duplicate events.
- Vercel logs: `Meta CAPI responded <status>` lines (no tokens or PII are logged).
- Supabase: `select * from meta_attribution_report;` and `meta_purchase_sent_at is null` for paid, consented orders = unsent.
- Expected gaps vs Stripe: consent declined, orders before go-live, orders without ad attribution. Accepted != attributed to an ad.
- Refunds: recorded in `preorders` as before; no negative Meta events are sent (verify Meta's current refund handling before adding).

## Test status
Verified (automated, `npm test`, 57 passing): hashing/normalization, value math, event id stability, attribution validation/consent gating, CAPI retry/no-retry, existing webhook/checkout suites unaffected.
**Not yet verified (needs Pixel ID/token and live Meta/Stripe test mode):** real events in Test Events, browser/server deduplication in Events Manager, Pixel Helper, webhook retry against Meta, unsuccessful/delayed payment, event match quality, domain verification, CSP in a deployed preview.

## Known limitations
- Pixel ID is a constant in `tracking.js` because the site is static; keep it in sync with the env var.
- Funnel events are browser-only; ad blockers drop them. Purchase is covered by CAPI.
- If migration 006 is not applied, "already sent" is not recorded and Meta's event_id dedup is the only duplicate guard.
- `session_id` is the only credential on `/api/order-purchase`; it returns totals and product IDs only. The browser Purchase only fires for orders placed within the last 2 hours; the server (CAPI) Purchase is not time-limited.
- Spend/ROAS are not computed (no Ads API integration); use Ads Manager.
