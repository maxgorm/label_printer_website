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
