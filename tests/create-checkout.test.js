import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import Stripe from 'stripe';
import handler from '../api/create-checkout.js';
import config from '../api/_config.js';

// Pin the clock inside the sale so printer prices do not depend on today's date.
const DURING_SALE = new Date('2026-11-20T12:00:00-05:00').getTime();
before(() => mock.timers.enable({ apis: ['Date'], now: DURING_SALE }));
after(() => mock.timers.reset());

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

test('checkout asks for an optional discovery source', async () => {
  const { res, requests } = await invoke({ product: 'single', colors: ['pink'], quantity: 1 });
  assert.equal(res.statusCode, 200);
  const params = requests[0].params;
  assert.equal(params.get('custom_fields[0][key]'), 'discovery');
  assert.equal(params.get('custom_fields[0][optional]'), 'true');
  assert.equal(params.get('custom_fields[0][type]'), 'dropdown');
  assert.equal(params.get('custom_fields[0][label][custom]'), 'How did you hear about us?');
  assert.equal(params.get('custom_fields[0][dropdown][options][0][value]'), 'instagram');
});

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
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '699');
  assert.equal(params.get('line_items[0][quantity]'), '3');
  assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), config.paper_tax_code);
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), null);
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
  assert.equal(params.get('metadata[product_key]'), 'paper');
  assert.equal(params.get('metadata[paper_bundles]'), JSON.stringify({ classic: 3 }));
  assert.equal(params.has('metadata[printer_color_1]'), false);
});

test('paper-only order ships free at $25 before tax', async () => {
  const four = await invoke({ paper: [{ bundle: 'classic', quantity: 4 }] }); // $27.96
  assert.equal(four.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  const three = await invoke({ paper: [{ bundle: 'dreamy', quantity: 3 }] }); // $29.97
  assert.equal(three.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  const two = await invoke({ paper: [{ bundle: 'dreamy', quantity: 2 }] }); // $19.98
  assert.equal(two.requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '499');
});

test('full-price paper in the printer form is a separate line item', async () => {
  const { res, requests } = await invoke({
    product: 'single', colors: ['black'], quantity: 1, paper: [{ bundle: 'dreamy', quantity: 2 }],
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2999');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '999');
  assert.equal(params.get('line_items[1][quantity]'), '2');
  assert.equal(params.get('line_items[1][price_data][product_data][metadata][paper_bundle]'), 'dreamy');
  assert.equal(params.get('metadata[paper_addon]'), '');
});

test('the Dreamy add-on is one $6.99 pack with a printer', async () => {
  const { res, requests } = await invoke({
    product: 'duo', colors: ['pink', 'pink'], quantity: 3, paper_addon: 'dreamy',
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '699');
  assert.equal(params.get('line_items[1][quantity]'), '1');
  assert.equal(params.get('line_items[1][price_data][product_data][metadata][paper_addon]'), 'true');
  assert.match(params.get('line_items[1][price_data][product_data][description]'), /\$9\.99/);
  assert.equal(params.get('metadata[paper_addon]'), 'dreamy');
  assert.equal(params.get('metadata[paper_packs]'), '1');
  assert.match(params.get('metadata[paper_summary]'), /1 × Dreamy \(5 rolls, add-on price\)/);
});

test('the Classic add-on is one $4.99 pack with a printer', async () => {
  const { res, requests } = await invoke({
    product: 'single', colors: ['white'], quantity: 1, paper_addon: 'classic',
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '499');
  assert.equal(params.get('line_items[1][quantity]'), '1');
  assert.match(params.get('line_items[1][price_data][product_data][description]'), /\$6\.99/);
});

test('retired Sweet and Bright packs can no longer be bought', async () => {
  for (const body of [
    { paper: [{ bundle: 'sweet', quantity: 1 }] },
    { paper: [{ bundle: 'bright', quantity: 1 }] },
    { product: 'duo', colors: ['pink', 'white'], paper_addon: 'sweet' },
    { product: 'duo', colors: ['pink', 'white'], paper_addon: 'bright' },
  ]) {
    const { res, requests } = await invoke(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(requests.length, 0);
  }
});

test('printer prices switch to regular prices when the sale ends on 12/1', async () => {
  const cases = [
    ['2026-11-30T23:59:59-05:00', '2999', '4999'],
    ['2026-12-01T00:00:00-05:00', '4999', '6999'],
    ['2027-01-15T12:00:00-05:00', '4999', '6999'],
  ];
  try {
    for (const [when, single, duo] of cases) {
      mock.timers.setTime(new Date(when).getTime());
      const one = await invoke({ product: 'single', colors: ['pink'], quantity: 1 });
      assert.equal(one.requests[0].params.get('line_items[0][price_data][unit_amount]'), single, when);
      assert.equal(one.requests[0].params.get('metadata[unit_price_cents]'), single, when);
      const two = await invoke({ product: 'duo', colors: ['pink', 'white'], quantity: 2 });
      assert.equal(two.requests[0].params.get('line_items[0][price_data][unit_amount]'), duo, when);
      assert.equal(two.requests[0].params.get('line_items[0][quantity]'), '2', when);
      assert.equal(two.requests[0].params.get('allow_promotion_codes'), 'true');
    }
  } finally {
    mock.timers.setTime(DURING_SALE);
  }
});

test('the add-on price needs a printer and a real bundle', async () => {
  for (const body of [
    { paper: [{ bundle: 'classic', quantity: 1 }], paper_addon: 'classic' },
    { product: 'duo', colors: ['pink', 'white'], paper_addon: 'gold' },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'gold', quantity: 1 }] },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'classic', quantity: 11 }] },
    { product: 'duo', colors: ['pink', 'white'], paper: [{ bundle: 'classic', quantity: 0 }] },
    { paper_addon: 'dreamy' },
  ]) {
    const { res, requests } = await invoke(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(requests.length, 0);
  }
});

// ---- International shipping ----

test('US is the default destination, with no phone collection or duties notice', async () => {
  const { requests } = await invoke({ product: 'duo', colors: ['pink', 'white'], quantity: 1 });
  const { params } = requests[0];
  assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), 'US');
  assert.equal(params.has('shipping_address_collection[allowed_countries][1]'), false);
  assert.equal(params.has('phone_number_collection[enabled]'), false);
  assert.equal(params.has('custom_text[shipping_address][message]'), false);
  assert.equal(params.get('metadata[shipping_country]'), 'US');
  assert.equal(params.get('metadata[expected_ship]'), config.expected_ship_label);
});

test('each listed country is charged its flat rate, even on printer orders', async () => {
  const expected = {
    CA: 1499, GB: 1999, DE: 1999, FR: 1999, NL: 1999, BE: 1999, IE: 1999, MX: 1999,
    IT: 2499, ES: 2499, SE: 2499, DK: 2499, AU: 2499, NZ: 2499, JP: 2499, KR: 2499, SG: 2499,
  };
  assert.deepEqual(config.international_shipping_cents, expected);
  for (const [country, cents] of Object.entries(expected)) {
    const { res, requests } = await invoke({ product: 'duo', colors: ['pink', 'white'], quantity: 2, country });
    assert.equal(res.statusCode, 200, country);
    const { params } = requests[0];
    assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), String(cents), country);
    assert.equal(params.get('shipping_options[0][shipping_rate_data][display_name]'), 'International shipping');
    assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), country);
    assert.equal(params.has('shipping_address_collection[allowed_countries][1]'), false);
    assert.equal(params.get('phone_number_collection[enabled]'), 'true');
    assert.equal(params.get('custom_text[shipping_address][message]'), config.duties_message);
    assert.match(params.get('custom_text[submit][message]'), /5-14 days\. Duties and taxes are the buyer’s responsibility\./);
    assert.equal(params.get('metadata[shipping_country]'), country);
    assert.equal(params.get('metadata[expected_ship]'), '5-14 days');
  }
});

test('international paper orders are never free and country codes are case-insensitive', async () => {
  const { res, requests } = await invoke({ paper: [{ bundle: 'classic', quantity: 4 }], country: 'ca' }); // $31.96
  assert.equal(res.statusCode, 200);
  assert.equal(requests[0].params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '1499');
  assert.equal(requests[0].params.get('shipping_address_collection[allowed_countries][0]'), 'CA');
});

test('unlisted countries never reach Stripe', async () => {
  for (const country of ['BR', 'CN', 'PR', 'XX', 'usa', 42]) {
    const { res, requests } = await invoke({ product: 'duo', colors: ['pink', 'white'], country });
    assert.equal(res.statusCode, 400, String(country));
    assert.equal(requests.length, 0);
  }
});

// ---- Mixed thermal paper bundles ----

test('several paper bundles become one Stripe line item each, with their own quantities', async () => {
  const { res, requests } = await invoke({
    paper: [
      { bundle: 'classic', quantity: 2 },
      { bundle: 'dreamy', quantity: 2 },
    ],
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '699');
  assert.equal(params.get('line_items[0][quantity]'), '2');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '999');
  assert.equal(params.get('line_items[1][quantity]'), '2');
  assert.equal(params.has('line_items[2][quantity]'), false);
  assert.equal(params.get('line_items[0][price_data][product_data][metadata][paper_bundle]'), 'classic');
  assert.equal(params.get('line_items[1][price_data][product_data][metadata][paper_bundle]'), 'dreamy');
  assert.deepEqual(JSON.parse(params.get('metadata[paper_bundles]')), { classic: 2, dreamy: 2 });
  assert.equal(params.get('metadata[paper_packs]'), '4');
  assert.equal(params.get('metadata[quantity]'), '4');
  assert.equal(params.get('metadata[paper_summary]'), '2 × Classic (3 rolls), 2 × Dreamy (5 rolls)');
  // $13.98 + $19.98 = $33.96, so shipping is free.
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
});

test('mixed paper with a printer and the add-on keeps every line separate', async () => {
  const { res, requests } = await invoke({
    product: 'duo', colors: ['pink', 'white'], quantity: 1,
    paper: [{ bundle: 'classic', quantity: 3 }, { bundle: 'dreamy', quantity: 2 }],
    paper_addon: 'classic',
  });
  assert.equal(res.statusCode, 200);
  const { params } = requests[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '4999');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '699');
  assert.equal(params.get('line_items[1][quantity]'), '3');
  assert.equal(params.get('line_items[2][price_data][unit_amount]'), '999');
  assert.equal(params.get('line_items[2][quantity]'), '2');
  assert.equal(params.get('line_items[3][price_data][unit_amount]'), '499');
  assert.equal(params.get('line_items[3][quantity]'), '1');
  assert.equal(params.get('metadata[paper_packs]'), '6');
});

test('a bundle can appear only up to the per-bundle limit and duplicates merge', async () => {
  const merged = await invoke({ paper: [{ bundle: 'classic', quantity: 1 }, { bundle: 'classic', quantity: 2 }] });
  assert.equal(merged.res.statusCode, 200);
  assert.equal(merged.requests[0].params.get('line_items[0][quantity]'), '3');
  assert.equal(merged.requests[0].params.has('line_items[1][quantity]'), false);
  const tooMany = await invoke({ paper: [{ bundle: 'dreamy', quantity: 6 }, { bundle: 'dreamy', quantity: 5 }] });
  assert.equal(tooMany.res.statusCode, 400);
  assert.equal(tooMany.requests.length, 0);
});
