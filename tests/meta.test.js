import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  attributionMetadata,
  buildPurchaseEvent,
  buildUserData,
  contentsFromMetadata,
  purchaseValueCents,
  sendCapiEvents,
  sha256,
} from '../api/_meta.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ['META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_TEST_EVENT_CODE']) delete process.env[key];
});

const paidSession = {
  id: 'cs_test_abc123',
  created: 1_700_000_000,
  currency: 'usd',
  amount_subtotal: 5998,
  amount_total: 6898,
  total_details: { amount_discount: 1000, amount_shipping: 499 },
  customer_details: { email: ' Jane.Doe@Example.com ', phone: '+1 (555) 010-9999', name: 'Jane Q Doe' },
  shipping_details: { address: { city: 'Salt Lake City', state: 'UT', postal_code: '84101-1234', country: 'US' } },
  metadata: {
    product_key: 'duo', product_slug: 'sentimo-2-pack', quantity: '1',
    paper_bundles: '{"sweet":1}', paper_addon: 'classic',
    meta_consent: '1', meta_fbp: 'fb.1.1700000000000.123', meta_fbc: 'fb.1.1700000000000.AbC-123',
    meta_ip: '203.0.113.9', meta_ua: 'UA/1.0', meta_src: 'https://sentimonotes.com/',
  },
};

test('purchase value is merchandise after discounts, excluding tax and shipping', () => {
  assert.equal(purchaseValueCents(paidSession), 4998);
  assert.equal(purchaseValueCents({ amount_subtotal: 100, total_details: { amount_discount: 500 } }), 0);
});

test('purchase event hashes PII, keeps fbp/fbc/ip/ua raw, and uses a stable event id', () => {
  const { event, valueCents } = buildPurchaseEvent(paidSession);
  assert.equal(valueCents, 4998);
  assert.equal(event.event_id, 'purchase_cs_test_abc123');
  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.action_source, 'website');
  assert.equal(event.custom_data.value, 49.98);
  assert.equal(event.custom_data.currency, 'USD');
  assert.deepEqual(event.custom_data.content_ids, ['sentimo-2-pack', 'paper-sweet', 'paper-classic']);
  assert.equal(event.custom_data.num_items, 3);
  const u = event.user_data;
  assert.equal(u.em, sha256('jane.doe@example.com'));
  assert.equal(u.ph, sha256('15550109999'));
  assert.equal(u.zip, sha256('84101'));
  assert.equal(u.ct, sha256('saltlakecity'));
  assert.equal(u.fbp, 'fb.1.1700000000000.123');
  assert.equal(u.fbc, 'fb.1.1700000000000.AbC-123');
  assert.equal(u.client_ip_address, '203.0.113.9');
  assert.equal(u.client_user_agent, 'UA/1.0');
  // Retried deliveries must produce an identical event.
  assert.deepEqual(buildPurchaseEvent(paidSession).event, event);
});

test('paper-only orders list only paper bundles', () => {
  const contents = contentsFromMetadata({ product_key: 'paper', paper_bundles: '{"bright":2}' });
  assert.deepEqual(contents, [{ id: 'paper-bright', quantity: 2 }]);
});

test('attribution metadata requires consent and validates identifiers', () => {
  assert.deepEqual(attributionMetadata({ consent: false, fbp: 'fb.1.1700000000000.1' }, {}), {});
  assert.deepEqual(attributionMetadata(undefined, {}), {});
  const meta = attributionMetadata({
    consent: true, fbp: 'bad', fbc: 'fb.1.1700000000000.AbC', utm_source: 'ig', ref: 'creator-1',
    landing: '/gifts/x', src: 'javascript:alert(1)',
  }, { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1', 'user-agent': 'UA' } });
  assert.equal(meta.meta_consent, '1');
  assert.equal(meta.meta_fbp, undefined);
  assert.equal(meta.meta_fbc, 'fb.1.1700000000000.AbC');
  assert.equal(meta.utm_source, 'ig');
  assert.equal(meta.referral_code, 'creator-1');
  assert.equal(meta.meta_src, undefined);
  assert.equal(meta.meta_ip, '198.51.100.7');
});

test('buildUserData omits empty fields', () => {
  assert.deepEqual(buildUserData({ email: '', attribution: {} }), {});
});

test('CAPI is skipped when not configured', async () => {
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  assert.deepEqual(await sendCapiEvents([{}]), { ok: false, retryable: false, skipped: true });
});

test('CAPI retries transient failures with the same event and keeps the token out of the URL', async () => {
  process.env.META_PIXEL_ID = '123456789';
  process.env.META_CAPI_TOKEN = 'secret-token';
  process.env.META_TEST_EVENT_CODE = 'TEST123';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}', { status: calls.length < 3 ? 503 : 200 });
  };
  const event = { event_name: 'Purchase', event_id: 'purchase_x' };
  assert.deepEqual(await sendCapiEvents([event], { delayMs: 1 }), { ok: true });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => !c.url.includes('secret-token') && c.url.includes('/123456789/events')));
  assert.ok(calls.every((c) => c.body.data[0].event_id === 'purchase_x' && c.body.test_event_code === 'TEST123'));
});

test('CAPI does not retry permanent (4xx) failures', async () => {
  process.env.META_PIXEL_ID = '123456789';
  process.env.META_CAPI_TOKEN = 'secret-token';
  let count = 0;
  globalThis.fetch = async () => { count += 1; return new Response('{}', { status: 400 }); };
  assert.deepEqual(await sendCapiEvents([{}], { delayMs: 1 }), { ok: false, retryable: false });
  assert.equal(count, 1);
});
