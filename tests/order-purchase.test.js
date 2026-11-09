import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Stripe from 'stripe';
import handler from '../api/order-purchase.js';

async function lookup(session) {
  const originalPrep = Stripe.prototype._prepResources;
  const prep = mock.method(Stripe.prototype, '_prepResources', function () {
    this._setApiField('httpClient', {
      getClientName: () => 'order-purchase-test',
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
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  try {
    await handler({ method: 'GET', query: { session_id: 'cs_test_abcdefghij12345' } }, res);
    return res.body;
  } finally {
    prep.mock.restore();
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
}

const now = () => Math.floor(Date.now() / 1000);
const base = (over) => ({
  id: 'cs_test_abcdefghij12345', payment_status: 'paid', currency: 'usd',
  amount_subtotal: 4999, total_details: { amount_discount: 0 },
  metadata: { product_key: 'duo', product_slug: 'sentimo-2-pack', quantity: '1' },
  created: now() - 600, ...over,
});

test('a recent paid order returns verified purchase data with the shared event id', async () => {
  const body = await lookup(base());
  assert.equal(body.purchase.event_id, 'purchase_cs_test_abcdefghij12345');
  assert.equal(body.purchase.value, 49.99);
});

test('an order older than 2 hours does not fire a browser purchase', async () => {
  assert.deepEqual(await lookup(base({ created: now() - 3 * 60 * 60 })), { purchase: null });
});

test('an unpaid session does not fire a browser purchase', async () => {
  assert.deepEqual(await lookup(base({ payment_status: 'unpaid' })), { purchase: null });
});
