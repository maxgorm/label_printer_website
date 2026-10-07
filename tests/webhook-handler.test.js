import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Stripe from 'stripe';
import handler from '../api/webhook.js';

// Drives the real webhook handler with a signed event while Stripe, Supabase (PostgREST)
// and Resend are replaced by in-memory fakes. Nothing leaves the process.
async function runWebhook(session) {
  const secret = 'whsec_test_secret';
  const inserts = [];
  const updates = [];
  const emails = [];

  const originalPrep = Stripe.prototype._prepResources;
  const prep = mock.method(Stripe.prototype, '_prepResources', function () {
    this._setApiField('httpClient', {
      getClientName: () => 'webhook-test',
      async makeRequest() {
        return {
          getStatusCode: () => 200,
          getHeaders: () => ({}),
          getRawResponse: () => ({}),
          toJSON: async () => session,
        };
      },
    });
    originalPrep.call(this);
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    const method = (init.method || input?.method || 'GET').toUpperCase();
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (url.includes('api.resend.com')) {
      emails.push(JSON.parse(init.body));
      return json({ id: 'email_test' });
    }
    if (url.includes('/rest/v1/preorders')) {
      if (method === 'POST') {
        inserts.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') {
        updates.push(JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }
      const accept = new Headers(init.headers).get('accept') || '';
      const wantsObject = accept.includes('vnd.pgrst.object');
      const row = inserts.length
        ? { id: 'order-uuid', order_number: '00042', confirmation_email_sent_at: null }
        : null;
      if (wantsObject) return row ? json(row) : json({ message: 'not found' }, 406);
      return json(row ? [row] : []);
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };

  const env = {
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    RESEND_API_KEY: 're_placeholder',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);

  const payload = JSON.stringify({
    id: 'evt_test', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: session.id } },
  });
  const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({ payload, secret });
  const req = (async function* () { yield Buffer.from(payload); })();
  req.method = 'POST';
  req.headers = { 'stripe-signature': signature };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };

  try {
    await handler(req, res);
    return { res, inserts, updates, emails };
  } finally {
    globalThis.fetch = realFetch;
    prep.mock.restore();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const baseSession = {
  id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1',
  customer: null, created: 1790000000, currency: 'usd',
  customer_details: { email: 'buyer@example.com', name: 'Test Buyer' },
  shipping_details: { name: 'Test Buyer', address: { line1: '1 Main St', city: 'Ann Arbor', state: 'MI', postal_code: '48104', country: 'US' } },
};

test('printer order with the $4.99 add-on stores printers, paper rolls, and shipping', async () => {
  const { res, inserts, emails } = await runWebhook({
    ...baseSession,
    amount_total: 5498,
    total_details: { amount_shipping: 0 },
    metadata: {
      product_key: 'duo', product_slug: 'sentimo-2-pack', product_name: 'Sentimo 2-Pack',
      unit_price_cents: '4999', printer_count: '2', order_type: 'preorder', expected_ship: 'Fall 2026',
      quantity: '1', printer_colors: 'Pink, White', printer_color_1: 'Pink', printer_color_2: 'White',
      shipping_cents: '0', paper_bundles: '{}', paper_addon: 'sweet', paper_packs: '1',
      paper_summary: '1 × Sweet (3 rolls, add-on price)',
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(inserts.length, 1);
  const row = inserts[0];
  assert.deepEqual(row.color_counts, { pink: 1, white: 1 });
  assert.deepEqual(row.paper_bundles, { sweet: 1 });
  assert.deepEqual(row.roll_counts, { pink: 1, purple: 1, yellow: 1 });
  assert.equal(row.shipping_amount, 0);
  assert.equal(row.total_amount, 5498);
  assert.match(row.notes, /Printer colors: Pink, White/);
  assert.match(row.notes, /Thermal paper: 1 × Sweet/);
  assert.equal(emails.length, 1);
  assert.match(emails[0].html, /Thermal paper/);
  assert.match(emails[0].html, /00042/);
});

test('paper-only order is recorded with empty printer colors and a shipping charge', async () => {
  const { res, inserts, emails } = await runWebhook({
    ...baseSession,
    id: 'cs_test_2',
    amount_total: 1597 + 499,
    total_details: { amount_shipping: 499 },
    metadata: {
      product_key: 'paper', product_slug: 'sentimo-paper', product_name: 'Sentimo Thermal Paper',
      unit_price_cents: '0', printer_count: '0', order_type: 'preorder', expected_ship: 'Fall 2026',
      quantity: '2', shipping_cents: '499', paper_bundles: '{"classic":2}', paper_addon: '',
      paper_packs: '2', paper_summary: '2 × Classic (3 rolls)',
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const row = inserts[0];
  assert.deepEqual(row.color_counts, {});
  assert.deepEqual(row.roll_counts, { white: 6 });
  assert.equal(row.product_slug, 'sentimo-paper');
  assert.equal(row.unit_price, null);
  assert.equal(row.shipping_amount, 499);
  assert.equal(emails.length, 1);
  assert.doesNotMatch(emails[0].html, /Printer color/);
});

test('an old-style printer order with no paper metadata still works', async () => {
  const { res, inserts } = await runWebhook({
    ...baseSession,
    id: 'cs_test_3',
    amount_total: 3200,
    total_details: {},
    metadata: {
      product_key: 'single', product_slug: 'sentimo-single', product_name: 'Sentimo Single Printer',
      unit_price_cents: '2900', printer_count: '1', quantity: '1',
      printer_colors: 'Black', printer_color_1: 'Black',
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(inserts[0].color_counts, { black: 1 });
  assert.deepEqual(inserts[0].roll_counts, {});
  assert.deepEqual(inserts[0].paper_bundles, {});
});

test('a mixed paper order records every bundle and the right rolls per color', async () => {
  const { res, inserts, emails } = await runWebhook({
    ...baseSession,
    id: 'cs_test_4',
    amount_total: 3396,
    total_details: { amount_shipping: 0 },
    metadata: {
      product_key: 'paper', product_slug: 'sentimo-paper', product_name: 'Sentimo Thermal Paper',
      unit_price_cents: '0', printer_count: '0', quantity: '4', shipping_cents: '0',
      paper_bundles: '{"classic":2,"sweet":1,"bright":1}', paper_addon: '', paper_packs: '4',
      paper_summary: '2 × Classic (3 rolls), 1 × Sweet (3 rolls), 1 × Bright (3 rolls)',
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const row = inserts[0];
  assert.deepEqual(row.paper_bundles, { classic: 2, sweet: 1, bright: 1 });
  assert.deepEqual(row.roll_counts, { white: 6, pink: 1, purple: 1, yellow: 1, mint: 1, blue: 1, orange: 1 });
  assert.equal(row.quantity, 4);
  assert.match(emails[0].html, /2 × Classic/);
  assert.match(emails[0].html, /1 × Bright/);
});
