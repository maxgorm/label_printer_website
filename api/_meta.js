/**
 * Meta (Facebook/Instagram) measurement helpers: attribution capture for Stripe
 * Checkout metadata, Purchase value/contents, and the Conversions API (CAPI) client.
 *
 * Environment:
 *   META_PIXEL_ID          Dataset/Pixel ID (same one used in public/assets/js/tracking.js)
 *   META_CAPI_TOKEN        Conversions API access token (server only, never logged)
 *   META_API_VERSION       Optional Graph API version, default below
 *   META_TEST_EVENT_CODE   Optional; routes events to Events Manager > Test events
 *
 * Purchase value convention: merchandise revenue after discounts, excluding tax and
 * shipping = Stripe amount_subtotal - total_details.amount_discount.
 */
import { createHash } from 'node:crypto';
import PREORDER_CONFIG from './_config.js';
import { parsePaperMetadata } from './_paper.js';

const DEFAULT_API_VERSION = 'v23.0';

export function metaConfigured() {
  return Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

export const purchaseEventId = (sessionId) => `purchase_${sessionId}`;
export const checkoutEventId = (sessionId) => `checkout_${sessionId}`;

// ---------- hashing / normalization (Meta requires SHA-256 of normalized values) ----------
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function hashed(value, normalize = (v) => v) {
  const normalized = normalize(String(value ?? '').trim().toLowerCase());
  return normalized ? sha256(normalized) : undefined;
}

export function buildUserData({ email, phone, name, address, attribution = {} }) {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const country = address?.country;
  const user = {
    em: hashed(email),
    ph: hashed(phone, (v) => v.replace(/\D/g, '')),
    fn: first ? hashed(first) : undefined,
    ln: rest.length ? hashed(rest.join(' ')) : undefined,
    ct: hashed(address?.city, (v) => v.replace(/[^\p{L}\p{N}]/gu, '')),
    st: hashed(address?.state, (v) => v.replace(/[^\p{L}\p{N}]/gu, '')),
    zip: hashed(address?.postal_code, (v) => (country === 'US' ? v.slice(0, 5) : v.replace(/\s/g, ''))),
    country: hashed(country),
    // Not hashed: Meta expects these in their original form.
    fbp: attribution.fbp || undefined,
    fbc: attribution.fbc || undefined,
    client_ip_address: attribution.ip || undefined,
    client_user_agent: attribution.ua || undefined,
  };
  return Object.fromEntries(Object.entries(user).filter(([, v]) => v !== undefined));
}

// ---------- attribution captured at checkout creation ----------
const FBP_RE = /^fb\.\d\.\d{10,13}\.\d{1,20}$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\.[\w-]{1,300}$/;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

/**
 * Turn the browser's attribution object into Stripe Checkout metadata. Nothing is
 * stored unless the visitor's consent state was "granted" when checkout started.
 * Click identifiers are validated, never rewritten.
 */
export function attributionMetadata(input, req) {
  if (!input || typeof input !== 'object' || input.consent !== true) return {};
  const meta = { meta_consent: '1' };
  if (FBP_RE.test(input.fbp)) meta.meta_fbp = input.fbp;
  if (FBC_RE.test(input.fbc)) meta.meta_fbc = input.fbc;
  for (const key of UTM_KEYS) {
    const value = clean(input[key], 100);
    if (value) meta[key] = value;
  }
  const ref = clean(input.ref, 64);
  if (/^[\w.-]+$/.test(ref)) meta.referral_code = ref;
  const landing = clean(input.landing, 200);
  if (landing.startsWith('/')) meta.landing_path = landing;
  const src = clean(input.src, 450);
  if (/^https:\/\/[^\s]+$/.test(src)) meta.meta_src = src;

  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (/^[0-9a-fA-F:.]{3,45}$/.test(forwarded)) meta.meta_ip = forwarded;
  const ua = clean(req?.headers?.['user-agent'], 300);
  if (ua) meta.meta_ua = ua;
  return meta;
}

export function attributionFromMetadata(metadata = {}) {
  return {
    consent: metadata.meta_consent === '1',
    fbp: metadata.meta_fbp,
    fbc: metadata.meta_fbc,
    ip: metadata.meta_ip,
    ua: metadata.meta_ua,
    src: metadata.meta_src,
  };
}

/** Non-identifying marketing attribution, kept for internal reporting. */
export function reportingAttribution(metadata = {}) {
  const out = {};
  for (const key of [...UTM_KEYS, 'referral_code', 'landing_path']) if (metadata[key]) out[key] = metadata[key];
  out.meta_click = Boolean(metadata.meta_fbc);
  out.consent = metadata.meta_consent === '1';
  return out;
}

// ---------- purchase / checkout payloads ----------
/** Merchandise revenue after discounts, excluding tax and shipping, in cents. */
export function purchaseValueCents(session) {
  return Math.max(0, (session.amount_subtotal ?? 0) - (session.total_details?.amount_discount ?? 0));
}

/** Stable product IDs (the product/paper slugs) with quantities, from session metadata. */
export function contentsFromMetadata(metadata = {}) {
  const contents = [];
  if (metadata.product_key && metadata.product_key !== 'paper') {
    contents.push({ id: metadata.product_slug, quantity: parseInt(metadata.quantity, 10) || 1 });
  }
  const paper = parsePaperMetadata(metadata);
  for (const [bundle, packs] of Object.entries(paper.bundles)) {
    contents.push({ id: PREORDER_CONFIG.paper_bundles[bundle].slug, quantity: packs });
  }
  return contents;
}

export function commerceData({ contents, valueCents, currency }) {
  return {
    value: Math.round(valueCents) / 100,
    currency: String(currency || PREORDER_CONFIG.currency).toUpperCase(),
    content_type: 'product',
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
  };
}

// ---------- Conversions API ----------
/**
 * Send events to CAPI. Retries network errors, 429 and 5xx with the SAME event ids.
 * Returns { ok: true } or { ok: false, retryable }. Never logs the token or user data.
 */
export async function sendCapiEvents(events, { attempts = 3, delayMs = 400 } = {}) {
  if (!metaConfigured()) return { ok: false, retryable: false, skipped: true };
  const version = (process.env.META_API_VERSION || DEFAULT_API_VERSION).trim();
  const url = `https://graph.facebook.com/${version}/${process.env.META_PIXEL_ID.trim()}/events`;
  const body = JSON.stringify({
    data: events,
    access_token: process.env.META_CAPI_TOKEN.trim(),
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE.trim() } : {}),
  });

  let retryable = true;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return { ok: true };
      retryable = response.status === 429 || response.status >= 500;
      console.error(`Meta CAPI responded ${response.status} (attempt ${attempt})`);
      if (!retryable) return { ok: false, retryable: false };
    } catch (err) {
      retryable = true;
      console.error(`Meta CAPI request failed (attempt ${attempt}):`, err.name);
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
  }
  return { ok: false, retryable };
}

export function buildPurchaseEvent(session) {
  const metadata = session.metadata || {};
  const attribution = attributionFromMetadata(metadata);
  const address = session.shipping_details?.address || session.customer_details?.address || {};
  const contents = contentsFromMetadata(metadata);
  const valueCents = purchaseValueCents(session);
  return {
    event: {
      event_name: 'Purchase',
      // Stripe's session creation time keeps the event time stable across webhook retries.
      event_time: session.created || Math.floor(Date.now() / 1000),
      event_id: purchaseEventId(session.id),
      action_source: 'website',
      event_source_url: attribution.src || 'https://sentimonotes.com/order-confirmed.html',
      user_data: buildUserData({
        email: session.customer_details?.email,
        phone: session.customer_details?.phone,
        name: session.customer_details?.name,
        address,
        attribution,
      }),
      custom_data: commerceData({ contents, valueCents, currency: session.currency }),
    },
    valueCents,
  };
}
