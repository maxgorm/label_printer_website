import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import Stripe from 'stripe';
import checkoutHandler from '../api/create-checkout.js';
import webhookHandler from '../api/webhook.js';
import { contentsFromMetadata } from '../api/_meta.js';
import { normalizeCart, parsePrinterItems } from '../api/_cart.js';

// Cart checkout: several printer lines plus paper in one Stripe session, and the webhook
// turning that session into one order row. Stripe, Supabase, and Resend are faked.
const DURING_SALE = new Date('2026-11-20T12:00:00-05:00').getTime();
before(() => mock.timers.enable({ apis: ['Date'], now: DURING_SALE }));
after(() => mock.timers.reset());

function fakeStripe(respond) {
  const originalPrep = Stripe.prototype._prepResources;
  return mock.method(Stripe.prototype, '_prepResources', function () {
    this._setApiField('httpClient', {
      getClientName: () => 'cart-test',
      async makeRequest(host, port, path, verb, headers, data) {
        return {
          getStatusCode: () => 200,
          getHeaders: () => ({}),
          getRawResponse: () => ({}),
          toJSON: async () => respond({ path, params: new URLSearchParams(data) }),
        };
      },
    });
    originalPrep.call(this);
  });
}

function withEnv(env) {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
}

const fakeRes = () => ({
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

async function checkout(body) {
  const requests = [];
  const prep = fakeStripe((request) => {
    requests.push(request);
    return { id: 'cs_test_cart', url: 'https://checkout.stripe.com/cart-session' };
  });
  const restore = withEnv({ STRIPE_SECRET_KEY: 'sk_test_placeholder' });
  const res = fakeRes();
  try {
    await checkoutHandler({ method: 'POST', body, headers: { host: 'sentimonotes.com' } }, res);
    return { res, params: requests[0]?.params };
  } finally {
    prep.mock.restore();
    restore();
  }
}

// ===================== normalizeCart =====================
test('normalizeCart merges identical printer lines and keeps color order', () => {
  const cart = normalizeCart({ items: [
    { type: 'printer', product: 'duo', colors: ['pink', 'white'], quantity: 1 },
    { type: 'printer', product: 'duo', colors: ['pink', 'white'], quantity: 2 },
    { type: 'printer', product: 'duo', colors: ['white', 'pink'], quantity: 1 },
    { type: 'paper', bundle: 'classic', quantity: 2 },
  ] });
  assert.equal(cart.error, undefined);
  assert.deepEqual(cart.printers, [
    { product: 'duo', colors: ['pink', 'white'], quantity: 3 },
    { product: 'duo', colors: ['white', 'pink'], quantity: 1 },
  ]);
  assert.deepEqual(cart.paper, { classic: 2 });
});

test('normalizeCart rejects empty carts, bad items, and too many printers', () => {
  assert.ok(normalizeCart({ items: [] }).error);
  assert.ok(normalizeCart({ items: [{ type: 'sticker' }] }).error);
  assert.ok(normalizeCart({ items: [{ type: 'printer', product: 'duo', colors: ['pink'], quantity: 1 }] }).error);
  assert.ok(normalizeCart({ items: [{ type: 'printer', product: 'single', colors: ['pink'], quantity: 11 }] }).error);
  assert.ok(normalizeCart({ items: [{ type: 'printer', product: 'nope', colors: ['pink'], quantity: 1 }] }).error);
});

test('normalizeCart only allows the discounted add-on with a printer', () => {
  const paperOnly = normalizeCart({ items: [{ type: 'paper', bundle: 'classic', quantity: 1 }], paper_addon: 'dreamy' });
  assert.match(paperOnly.error, /requires a printer/);
  const withPrinter = normalizeCart({
    items: [{ type: 'printer', product: 'single', colors: ['black'], quantity: 1 }],
    paper_addon: 'dreamy',
  });
  assert.equal(withPrinter.addon, 'dreamy');
});

test('normalizeCart still accepts the legacy single-product payload', () => {
  const cart = normalizeCart({ product: 'duo', colors: ['pink', 'white'], quantity: 2 });
  assert.deepEqual(cart.printers, [{ product: 'duo', colors: ['pink', 'white'], quantity: 2 }]);
  const paper = normalizeCart({ paper: [{ bundle: 'dreamy', quantity: 1 }] });
  assert.deepEqual(paper.printers, []);
  assert.deepEqual(paper.paper, { dreamy: 1 });
});

// ===================== create-checkout =====================
test('a mixed cart becomes one Stripe session with a line per cart item', async () => {
  const { res, params } = await checkout({
    country: 'US',
    paper_addon: 'classic',
    items: [
      { type: 'printer', product: 'duo', colors: ['pink', 'white'], quantity: 1 },
      { type: 'printer', product: 'single', colors: ['black'], quantity: 2 },
      { type: 'paper', bundle: 'dreamy', quantity: 2 },
    ],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.url, 'https://checkout.stripe.com/cart-session');

  assert.equal(params.get('line_items[0][price_data][product_data][name]'), 'Sentimo 2-Pack');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '4999');
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '2999');
  assert.equal(params.get('line_items[1][quantity]'), '2');
  assert.equal(params.get('line_items[2][price_data][unit_amount]'), '999');
  assert.equal(params.get('line_items[2][quantity]'), '2');
  assert.equal(params.get('line_items[3][price_data][unit_amount]'), '499');
  assert.equal(params.get('line_items[3][price_data][product_data][metadata][paper_addon]'), 'true');
  assert.equal(params.get('line_items[4]'), null);

  assert.equal(params.get('metadata[product_key]'), 'mixed');
  assert.equal(params.get('metadata[product_slug]'), 'sentimo-mixed');
  assert.equal(params.get('metadata[quantity]'), '3');
  assert.equal(params.get('metadata[printer_count]'), '4');
  assert.deepEqual(JSON.parse(params.get('metadata[printer_items]')), [['duo', ['pink', 'white'], 1], ['single', ['black'], 2]]);
  assert.equal(params.get('metadata[paper_addon]'), 'classic');
  assert.match(params.get('metadata[printer_colors]'), /2-Pack × 1 \(Pink, White\); Single Printer × 2 \(Black\)/);
  assert.equal(params.get('cancel_url'), 'https://sentimonotes.com/#cart');
  // $49.99 + 2 × $29.99 + 2 × $9.99 + $4.99 is over $25, so US shipping is free.
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
});

test('a cart with one printer line keeps the single-product metadata shape', async () => {
  const { res, params } = await checkout({
    country: 'US',
    items: [{ type: 'printer', product: 'duo', colors: ['white', 'white'], quantity: 2 }],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(params.get('metadata[product_key]'), 'duo');
  assert.equal(params.get('metadata[printer_count]'), '2');
  assert.equal(params.get('metadata[quantity]'), '2');
  assert.equal(params.get('metadata[printer_color_1]'), 'White');
  assert.equal(params.get('metadata[printer_color_2]'), 'White');
});

test('a paper-only cart under $25 pays US shipping and has no printer items', async () => {
  const { res, params } = await checkout({ country: 'US', items: [{ type: 'paper', bundle: 'classic', quantity: 1 }] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(params.get('metadata[product_key]'), 'paper');
  assert.equal(params.get('metadata[printer_items]'), null);
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
});

test('checkout rejects an invalid cart before calling Stripe', async () => {
  const { res, params } = await checkout({ country: 'US', items: [] });
  assert.equal(res.statusCode, 400);
  assert.equal(params, undefined);
});

// ===================== metadata parsing =====================
test('parsePrinterItems reads cart metadata and rejects tampered values', () => {
  assert.deepEqual(parsePrinterItems({}), []);
  assert.deepEqual(parsePrinterItems({ printer_items: '[["single",["white"],1]]' }), [{ product: 'single', colors: ['white'], quantity: 1 }]);
  assert.throws(() => parsePrinterItems({ printer_items: '[["duo",["pink"],1]]' }));
  assert.throws(() => parsePrinterItems({ printer_items: 'not json' }));
});

test('Meta purchase contents sum cart printer lines per product', () => {
  const contents = contentsFromMetadata({
    product_key: 'mixed',
    printer_items: '[["duo",["pink","white"],1],["duo",["black","black"],1],["single",["black"],2]]',
    paper_bundles: '{"dreamy":1}',
    paper_addon: 'classic',
  });
  assert.deepEqual(contents, [
    { id: 'sentimo-2-pack', quantity: 2 },
    { id: 'sentimo-single', quantity: 2 },
    { id: 'paper-dreamy', quantity: 1 },
    { id: 'paper-classic', quantity: 1 },
  ]);
});

// ===================== webhook =====================
async function runWebhook(session, { missingCartItemsColumn = false } = {}) {
  const secret = 'whsec_test_secret';
  const inserts = [];
  const prep = fakeStripe(() => structuredClone(session));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    const method = (init.method || input?.method || 'GET').toUpperCase();
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (url.includes('api.resend.com')) return json({ id: 'email_test' });
    if (url.includes('/rest/v1/preorders')) {
      if (method === 'POST') {
        const row = JSON.parse(init.body);
        if (missingCartItemsColumn && 'cart_items' in row) {
          return json({ code: 'PGRST204', message: "Could not find the 'cart_items' column of 'preorders' in the schema cache" }, 400);
        }
        inserts.push(row);
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') return new Response(null, { status: 204 });
      const wantsObject = (new Headers(init.headers).get('accept') || '').includes('vnd.pgrst.object');
      const row = inserts.length ? { id: 'order-uuid', order_number: '00043', confirmation_email_sent_at: null } : null;
      if (wantsObject) return row ? json(row) : json({ message: 'not found' }, 406);
      return json(row ? [row] : []);
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
  const restore = withEnv({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    RESEND_API_KEY: 're_placeholder',
  });
  const payload = JSON.stringify({
    id: 'evt_cart', object: 'event', type: 'checkout.session.completed', data: { object: { id: session.id } },
  });
  const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({ payload, secret });
  const req = (async function* () { yield Buffer.from(payload); })();
  req.method = 'POST';
  req.headers = { 'stripe-signature': signature };
  const res = fakeRes();
  const logged = mock.method(console, 'error', () => {});
  try {
    await webhookHandler(req, res);
    return { res, inserts, errors: logged.mock.calls.map((call) => call.arguments.join(' ')) };
  } finally {
    logged.mock.restore();
    globalThis.fetch = realFetch;
    prep.mock.restore();
    restore();
  }
}

const mixedSession = {
  id: 'cs_test_cart', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_cart',
  customer: null, created: 1790000000, currency: 'usd', amount_total: 15000,
  total_details: { amount_shipping: 0 },
  customer_details: { email: 'buyer@example.com', name: 'Test Buyer' },
  shipping_details: { name: 'Test Buyer', address: { line1: '1 Main St', city: 'Ann Arbor', state: 'MI', postal_code: '48104', country: 'US' } },
  metadata: {
    product_key: 'mixed', product_slug: 'sentimo-mixed', product_name: 'Sentimo Printers',
    unit_price_cents: '', printer_count: '4', quantity: '3', order_type: 'preorder', expected_ship: 'Fall 2026',
    printer_items: '[["duo",["pink","white"],1],["single",["black"],2]]',
    printer_colors: '2-Pack × 1 (Pink, White); Single Printer × 2 (Black)',
    shipping_cents: '0', paper_bundles: '{"dreamy":2}', paper_addon: 'classic', paper_packs: '3',
    paper_summary: '2 × Dreamy, 1 × Classic (add-on price)',
  },
};

test('webhook stores a mixed cart as one order with per-line cart items', async () => {
  const { res, inserts } = await runWebhook(mixedSession);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(inserts.length, 1);
  const row = inserts[0];
  assert.equal(row.product_slug, 'sentimo-mixed');
  assert.equal(row.unit_price, null);
  assert.equal(row.quantity, 3);
  assert.deepEqual(row.color_counts, { pink: 1, white: 1, black: 2 });
  assert.deepEqual(row.paper_bundles, { dreamy: 2, classic: 1 });
  assert.deepEqual(row.cart_items, [
    { type: 'printer', product: 'duo', slug: 'sentimo-2-pack', colors: ['pink', 'white'], quantity: 1 },
    { type: 'printer', product: 'single', slug: 'sentimo-single', colors: ['black'], quantity: 2 },
    { type: 'paper', bundle: 'dreamy', quantity: 2 },
    { type: 'paper', bundle: 'classic', quantity: 1, addon: true },
  ]);
});

test('webhook still saves the order before migration_009 adds cart_items', async () => {
  const { res, inserts, errors } = await runWebhook(mixedSession, { missingCartItemsColumn: true });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(inserts.length, 1);
  assert.equal('cart_items' in inserts[0], false);
  assert.deepEqual(inserts[0].color_counts, { pink: 1, white: 1, black: 2 });
  assert.ok(errors.some((message) => message.includes('migration_009')));
});
