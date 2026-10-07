import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Stripe from 'stripe';
import handler from '../api/create-checkout.js';
import config from '../api/_config.js';

// Capture the real Stripe SDK's serialized HTTP request without networking,
// credentials, charges, or changes to the production handler's dependencies.
async function invoke(body, method = 'POST') {
  const requests = [];
  const originalPrep = Stripe.prototype._prepResources;
  const prep = mock.method(Stripe.prototype, '_prepResources', function () {
    this._setApiField('httpClient', {
      getClientName: () => 'checkout-test',
      async makeRequest(host, port, path, verb, headers, data) {
        requests.push({ host, path, verb, params: new URLSearchParams(data) });
        return {
          getStatusCode: () => 200,
          getHeaders: () => ({}),
          getRawResponse: () => ({}),
          toJSON: async () => ({ id: 'cs_test_mock', url: 'https://checkout.stripe.com/test-session' }),
        };
      },
    });
    originalPrep.call(this);
  });
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  try {
    await handler({ method, body, headers: { host: 'sentimonotes.com' } }, res);
    return { res, requests };
  } finally {
    prep.mock.restore();
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
}

const variants = [
  ...config.available_colors.map(color => ({ product: 'single', colors: [color] })),
  ...config.available_colors.flatMap(first => config.available_colors.map(second => ({
    product: 'duo', colors: [first, second],
  }))),
  { colors: ['pink', 'white'] }, // Default offer also uses the tax-enabled path.
];

for (const variant of variants) {
  test(`SDK request enables tax for ${variant.product || 'default'} ${variant.colors.join('/')}`, async () => {
    const product = config.products[variant.product || config.default_product];
    const { res, requests } = await invoke({ ...variant, quantity: 2 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.url, 'https://checkout.stripe.com/test-session');
    assert.equal(requests.length, 1);
    const { host, path, verb, params } = requests[0];
    assert.equal(host, 'api.stripe.com');
    assert.equal(path, '/v1/checkout/sessions');
    assert.equal(verb, 'POST');
    assert.equal(params.get('automatic_tax[enabled]'), 'true');
    assert.equal(params.get('line_items[0][price_data][tax_behavior]'), 'exclusive');
    assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), 'txcd_34020027');
    assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), 'US');
    assert.equal(params.get('allow_promotion_codes'), 'true');
    assert.equal(params.get('line_items[0][price_data][unit_amount]'), String(product.unit_price_cents));
    assert.equal(params.get('line_items[0][quantity]'), '2');
    assert.equal(params.get('metadata[product_key]'), variant.product || config.default_product);
    assert.equal(params.get('metadata[printer_colors]'), variant.colors.map(c => config.color_labels[c]).join(', '));
    assert.equal(params.get('payment_intent_data[metadata][printer_color_1]'), config.color_labels[variant.colors[0]]);
    assert.equal(params.get('success_url'), `https://sentimonotes.com${config.success_url}`);
    assert.equal(params.get('cancel_url'), `https://sentimonotes.com${config.cancel_url}`);
    assert.equal(params.has('line_items[0][tax_rates]'), false);
  });
}

for (const body of [
  { product: 'invalid', colors: ['pink'] },
  { product: 'single', colors: ['blue'] },
  { product: 'duo', colors: ['pink'] },
]) {
  test(`invalid selection never reaches Stripe: ${JSON.stringify(body)}`, async () => {
    const { res, requests } = await invoke(body);
    assert.equal(res.statusCode, 400);
    assert.equal(requests.length, 0);
  });
}

// ---- Pricing, thermal paper, and shipping ----

test('printer prices end in .99 and shipping is free on printer orders', async () => {
  assert.equal(config.products.single.unit_price_cents, 2999);
  assert.equal(config.products.duo.unit_price_cents, 4999);
  assert.equal(config.products.single.original_price, '$49.99');
  assert.equal(config.products.duo.original_price, '$69.99');
  const { res, requests } = await invoke({ product: 'duo', colors: ['pink', 'white'], quantity: 1 });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '4999');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][display_name]'), 'Free shipping');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][tax_behavior]'), 'exclusive');
});

test('paper-only order charges flat shipping below $25', async () => {
  const { res, requests } = await invoke({ paper: [{ bundle: 'classic', quantity: 3 }] });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '799');
  assert.equal(params.get('line_items[0][quantity]'), '3');
  assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), config.paper_tax_code);
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), null);
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
  assert.equal(params.get('metadata[product_key]'), 'paper');
  assert.equal(params.get('metadata[paper_bundles]'), JSON.stringify({ classic: 3 }));
  assert.equal(params.has('metadata[printer_color_1]'), false);
});

test('paper-only order ships free at $25 before tax', async () => {
  const four = await invoke({ paper: [{ bundle: 'classic', quantity: 4 }] }); // $31.96
  assert.equal(four.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  const three = await invoke({ paper: [{ bundle: 'sweet', quantity: 3 }] }); // $26.97
  assert.equal(three.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  const two = await invoke({ paper: [{ bundle: 'sweet', quantity: 2 }] }); // $17.98
  assert.equal(two.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
});

test('full-price paper in the printer form is a separate line item', async () => {
  const { res, requests } = await invoke({
    product: 'single', colors: ['black'], quantity: 1, paper: [{ bundle: 'bright', quantity: 2 }],
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2999');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '899');
  assert.equal(params.get('line_items[1][quantity]'), '2');
  assert.equal(params.get('line_items[1][price_data][product_data][metadata][paper_bundle]'), 'bright');
  assert.equal(params.get('metadata[paper_addon]'), '');
});

test('the $4.99 add-on is one discounted pack with a printer', async () => {
  const { res, requests } = await invoke({
    product: 'duo', colors: ['pink', 'pink'], quantity: 3, paper_addon: 'sweet',
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '499');
  assert.equal(params.get('line_items[1][quantity]'), '1');
  assert.equal(params.get('line_items[1][price_data][product_data][metadata][paper_addon]'), 'true');
  assert.match(params.get('line_items[1][price_data][product_data][description]'), /\$8\.99/);
  assert.equal(params.get('metadata[paper_addon]'), 'sweet');
  assert.equal(params.get('metadata[paper_packs]'), '1');
});

test('the add-on price needs a printer and a real bundle', async () => {
  for (const body of [
    { paper: [{ bundle: 'classic', quantity: 1 }], paper_addon: 'classic' },
    { product: 'duo', colors: ['pink', 'white'], paper_addon: 'gold' },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'gold', quantity: 1 }] },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'classic', quantity: 11 }] },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'classic', quantity: 0 }] },
    { paper_addon: 'sweet' },
  ]) {
    const { res, requests } = await invoke(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(requests.length, 0);
  }
});
