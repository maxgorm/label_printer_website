import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import Stripe from 'stripe';
import checkoutHandler from '../api/create-checkout.js';
import webhookHandler from '../api/webhook.js';
import { contentsFromMetadata } from '../api/_meta.js';
import { normalizeCart } from '../api/_cart.js';
import { bookCountFor, describeBooks, parseBookMetadata } from '../api/_books.js';

// Memory Books: A6 notebooks sold as a single ($4.99) or duo ($7.99), with or without a
// printer. Stripe, Supabase, and Resend are faked; nothing leaves the process.
const DURING_SALE = new Date('2026-11-20T12:00:00-05:00').getTime();
before(() => mock.timers.enable({ apis: ['Date'], now: DURING_SALE }));
after(() => mock.timers.reset());

function fakeStripe(respond) {
  const originalPrep = Stripe.prototype._prepResources;
  return mock.method(Stripe.prototype, '_prepResources', function () {
    this._setApiField('httpClient', {
      getClientName: () => 'books-test',
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
    return { id: 'cs_test_books', url: 'https://checkout.stripe.com/books-session' };
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

/** Stripe line items as [{ name, unit, quantity, metadata }]. */
function lineItems(params) {
  const lines = [];
  for (let i = 0; params.has(`line_items[${i}][quantity]`); i += 1) {
    const prefix = `line_items[${i}][price_data]`;
    lines.push({
      name: params.get(`${prefix}[product_data][name]`),
      unit: Number(params.get(`${prefix}[unit_amount]`)),
      quantity: Number(params.get(`line_items[${i}][quantity]`)),
      book: params.get(`${prefix}[product_data][metadata][memory_book]`),
      sku: params.get(`${prefix}[product_data][metadata][sku]`),
    });
  }
  return lines;
}

const subtotal = (params) => lineItems(params).reduce((sum, line) => sum + line.unit * line.quantity, 0);

const printer = (product, quantity = 1) => ({
  type: 'printer', product, colors: product === 'duo' ? ['pink', 'white'] : ['pink'], quantity,
});

// ===================== validation =====================
test('normalizeCart accepts Memory Books with or without a printer and merges variants', () => {
  const result = normalizeCart({ items: [
    { type: 'book', variant: 'duo', quantity: 1 },
    { type: 'book', variant: 'duo', quantity: 2 },
    { type: 'book', variant: 'single', quantity: 1 },
  ] });
  assert.deepEqual(result.printers, []);
  assert.deepEqual(result.books, { duo: 3, single: 1 });
  assert.equal(bookCountFor(result.books), 7);
});

test('normalizeCart rejects unknown variants, bad quantities, and more than the per-variant limit', () => {
  for (const item of [
    { type: 'book', variant: 'trio', quantity: 1 },
    { type: 'book', variant: 'duo', quantity: 0 },
    { type: 'book', variant: 'duo', quantity: 1.5 },
    { type: 'book', variant: 'duo', quantity: 11 },
    { type: 'book', variant: '__proto__', quantity: 1 },
  ]) {
    assert.ok(normalizeCart({ items: [item] }).error, JSON.stringify(item));
  }
});

// ===================== checkout =====================
// Acceptance table from the Memory Book spec (quantity 1, before tax and shipping).
const acceptance = [
  { printer: 'duo', paper: null, book: null, total: 4999 },
  { printer: 'duo', paper: 'classic', book: null, total: 5698 },
  { printer: 'duo', paper: 'dreamy', book: null, total: 5998 },
  { printer: 'duo', paper: null, book: 'single', total: 5498 },
  { printer: 'duo', paper: null, book: 'duo', total: 5798 },
  { printer: 'duo', paper: 'classic', book: 'duo', total: 6497 },
  { printer: 'duo', paper: 'dreamy', book: 'duo', total: 6797 },
  { printer: 'single', paper: null, book: 'single', total: 3498 },
  { printer: 'single', paper: 'dreamy', book: 'duo', total: 4797 },
];

for (const row of acceptance) {
  test(`checkout subtotal: ${row.printer} + ${row.paper || 'no paper'} + ${row.book || 'no book'} = $${row.total / 100}`, async () => {
    const items = [printer(row.printer)];
    if (row.paper) items.push({ type: 'paper', bundle: row.paper, quantity: 1 });
    if (row.book) items.push({ type: 'book', variant: row.book, quantity: 1 });
    const { res, params } = await checkout({ items });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(subtotal(params), row.total);
  });
}

test('Memory Books are real Stripe line items with SKU metadata and per-order quantities', async () => {
  const { res, params } = await checkout({ items: [
    printer('duo', 2),
    { type: 'book', variant: 'duo', quantity: 2 },
  ] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const book = lineItems(params).find((line) => line.book === 'duo');
  assert.deepEqual(book, { name: 'Sentimo Memory Book Duo', unit: 799, quantity: 2, book: 'duo', sku: 'MEMORY-BOOK-2' });
  // Two Duo-Packs plus two Memory Book Duos: $115.96 and four physical books.
  assert.equal(subtotal(params), 11596);
  assert.equal(params.get('metadata[memory_books]'), '{"duo":2}');
  assert.equal(params.get('metadata[memory_book_count]'), '4');
  assert.equal(params.get('metadata[product_key]'), 'duo');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(params.get('line_items[1][price_data][product_data][tax_code]'), 'txcd_99999999');
});

test('a Memory Book alone is an accessories order that pays US shipping under $25', async () => {
  const { res, params } = await checkout({ items: [{ type: 'book', variant: 'single', quantity: 1 }] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(subtotal(params), 499);
  assert.equal(params.get('metadata[product_key]'), 'accessories');
  assert.equal(params.get('metadata[product_slug]'), 'sentimo-accessories');
  assert.equal(params.get('metadata[memory_book_count]'), '1');
  assert.equal(params.get('metadata[printer_items]'), null);
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
});

test('the printer sale price never applies to Memory Books after the sale ends', async () => {
  mock.timers.setTime(new Date('2026-12-02T12:00:00-05:00').getTime());
  try {
    const { params } = await checkout({ items: [printer('duo'), { type: 'book', variant: 'single', quantity: 1 }] });
    assert.equal(subtotal(params), 6999 + 499);
  } finally {
    mock.timers.setTime(DURING_SALE);
  }
});

test('checkout is blocked when there are not enough notebooks for single + duo combined', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input?.url || input);
    if (url.includes('/rest/v1/book_stock')) {
      return new Response(JSON.stringify({ available_to_sell: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const restore = withEnv({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder' });
  try {
    // 1 duo (2 books) + 1 single (1 book) = 3 books, only 2 available.
    const short = await checkout({ items: [
      { type: 'book', variant: 'duo', quantity: 1 },
      { type: 'book', variant: 'single', quantity: 1 },
    ] });
    assert.equal(short.res.statusCode, 409);
    assert.match(short.res.body.error, /Memory Books/);
    const enough = await checkout({ items: [{ type: 'book', variant: 'duo', quantity: 1 }] });
    assert.equal(enough.res.statusCode, 200, JSON.stringify(enough.res.body));
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});

// ===================== metadata helpers =====================
test('Memory Book metadata round-trips and rejects tampered values', () => {
  assert.deepEqual(parseBookMetadata({ memory_books: '{"single":1,"duo":2}' }), { items: { single: 1, duo: 2 }, books: 5 });
  assert.deepEqual(parseBookMetadata({}), { items: {}, books: 0 });
  assert.throws(() => parseBookMetadata({ memory_books: '{"trio":1}' }));
  assert.throws(() => parseBookMetadata({ memory_books: '{"duo":0}' }));
  assert.throws(() => parseBookMetadata({ memory_books: '[1]' }));
  assert.equal(describeBooks({ duo: 1, single: 1 }), '1 × Memory Book Duo (2 books), 1 × Memory Book (1 book)');
});

test('Meta purchase contents list Memory Books by slug', () => {
  assert.deepEqual(contentsFromMetadata({
    product_key: 'accessories', product_slug: 'sentimo-accessories', quantity: '2',
    paper_bundles: '{"classic":1}', memory_books: '{"duo":1}',
  }), [
    { id: 'paper-classic', quantity: 1 },
    { id: 'memory-book-duo', quantity: 1 },
  ]);
});

// ===================== webhook =====================
async function runWebhook(session, { missingBookColumns = false } = {}) {
  const secret = 'whsec_test_secret';
  const inserts = [];
  const emails = [];
  const prep = fakeStripe(() => structuredClone(session));
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
        const row = JSON.parse(init.body);
        const missing = missingBookColumns && ['memory_books', 'memory_book_count'].find((column) => column in row);
        if (missing) {
          return json({ code: 'PGRST204', message: `Could not find the '${missing}' column of 'preorders' in the schema cache` }, 400);
        }
        inserts.push(row);
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') return new Response(null, { status: 204 });
      const wantsObject = (new Headers(init.headers).get('accept') || '').includes('vnd.pgrst.object');
      const row = inserts.length ? { id: 'order-uuid', order_number: '00044', confirmation_email_sent_at: null } : null;
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
    id: 'evt_books', object: 'event', type: 'checkout.session.completed', data: { object: { id: session.id } },
  });
  const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({ payload, secret });
  const req = (async function* () { yield Buffer.from(payload); })();
  req.method = 'POST';
  req.headers = { 'stripe-signature': signature };
  const res = fakeRes();
  const logged = mock.method(console, 'error', () => {});
  try {
    await webhookHandler(req, res);
    return { res, inserts, emails, errors: logged.mock.calls.map((call) => call.arguments.join(' ')) };
  } finally {
    logged.mock.restore();
    globalThis.fetch = realFetch;
    prep.mock.restore();
    restore();
  }
}

const baseSession = {
  object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_books',
  customer: null, created: 1790000000, currency: 'usd',
  customer_details: { email: 'buyer@example.com', name: 'Test Buyer' },
  shipping_details: { name: 'Test Buyer', address: { line1: '1 Main St', city: 'Ann Arbor', state: 'MI', postal_code: '48104', country: 'US' } },
};

const printerWithBooks = {
  ...baseSession,
  id: 'cs_test_printer_books', amount_total: 5798, total_details: { amount_shipping: 0 },
  metadata: {
    product_key: 'duo', product_slug: 'sentimo-2-pack', product_name: 'Sentimo 2-Pack',
    unit_price_cents: '4999', printer_count: '2', quantity: '1', order_type: 'preorder', expected_ship: '2-5 days',
    printer_items: '[["duo",["pink","white"],1]]',
    printer_colors: 'Pink, White', printer_color_1: 'Pink', printer_color_2: 'White', shipping_cents: '0',
    memory_books: '{"duo":1}', memory_book_count: '2', memory_book_summary: '1 × Memory Book Duo (2 books)',
  },
};

test('webhook records Memory Books as physical books on the order, packing list, notes, and email', async () => {
  const { res, inserts, emails } = await runWebhook(printerWithBooks);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const row = inserts[0];
  assert.deepEqual(row.memory_books, { duo: 1 });
  assert.equal(row.memory_book_count, 2);
  assert.deepEqual(row.color_counts, { pink: 1, white: 1 });
  assert.deepEqual(row.cart_items.at(-1), { type: 'book', variant: 'duo', sku: 'MEMORY-BOOK-2', quantity: 1, books: 2 });
  assert.match(row.notes, /Memory Books: 1 × Memory Book Duo \(2 books\)/);
  assert.match(emails[0].html, /Memory Books:<\/strong> 1 × Memory Book Duo \(2 books\)/);
});

test('webhook records a Memory Book-only order with no printers or paper', async () => {
  const { res, inserts } = await runWebhook({
    ...baseSession,
    id: 'cs_test_books_only', amount_total: 499 + 499, total_details: { amount_shipping: 499 },
    metadata: {
      product_key: 'accessories', product_slug: 'sentimo-accessories', product_name: 'Sentimo Accessories',
      unit_price_cents: '0', printer_count: '0', quantity: '1', order_type: 'preorder', expected_ship: '2-5 days',
      shipping_cents: '499', memory_books: '{"single":1}', memory_book_count: '1',
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const row = inserts[0];
  assert.deepEqual(row.color_counts, {});
  assert.deepEqual(row.roll_counts, {});
  assert.equal(row.memory_book_count, 1);
  assert.equal(row.product_slug, 'sentimo-accessories');
  assert.equal(row.unit_price, null);
});

test('an accessories order with neither paper nor books is rejected', async () => {
  const { res, inserts } = await runWebhook({
    ...baseSession,
    id: 'cs_test_empty', amount_total: 0, total_details: { amount_shipping: 0 },
    metadata: { product_key: 'accessories', product_slug: 'sentimo-accessories', quantity: '0' },
  });
  assert.equal(res.statusCode, 500);
  assert.equal(inserts.length, 0);
});

test('webhook still saves a printer order before migration_010 adds the Memory Book columns', async () => {
  const { res, inserts, errors } = await runWebhook(printerWithBooks, { missingBookColumns: true });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(inserts.length, 1);
  assert.equal('memory_books' in inserts[0], false);
  assert.equal('memory_book_count' in inserts[0], false);
  assert.match(inserts[0].notes, /Memory Books: 1 × Memory Book Duo/);
  assert.ok(errors.some((message) => message.includes('migration_010')));
});

test('adding Memory Books never adds a shipping charge to a printer order', async () => {
  for (const country of ['US', 'CA', 'GB', 'JP']) {
    const shipping = async (items) => (await checkout({ items, country }))
      .params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]');
    const withoutBooks = await shipping([printer('single')]);
    const withBooks = await shipping([printer('single'), { type: 'book', variant: 'duo', quantity: 10 }, { type: 'book', variant: 'single', quantity: 10 }]);
    assert.equal(withBooks, withoutBooks, country);
  }
});
