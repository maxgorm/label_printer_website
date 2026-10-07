import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/shipment-notify.js';

const SECRET = 'shipment-secret-for-tests';

async function call({ headers = { 'x-webhook-secret': SECRET }, order, body = { record: { id: 'order-uuid' } } }) {
  const emails = [];
  const updates = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    const method = (init.method || 'GET').toUpperCase();
    const json = (value, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (url.includes('api.resend.com')) {
      emails.push({ ...JSON.parse(init.body), headers: init.headers });
      return json({ id: 'email_test' });
    }
    if (url.includes('/rest/v1/preorders')) {
      if (method === 'PATCH') {
        updates.push(JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }
      return json(order);
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
  const env = {
    SHIPMENT_WEBHOOK_SECRET: SECRET,
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    RESEND_API_KEY: 're_placeholder',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  try {
    await handler({ method: 'POST', headers, body }, res);
    return { res, emails, updates };
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const shippedOrder = {
  id: 'order-uuid', email: 'buyer@example.com', full_name: 'Test Buyer', order_number: '00042',
  order_status: 'paid', fulfillment_status: 'shipped', tracking_carrier: null,
  tracking_number: '9400111899223197428490', shipping_email_sent_at: null,
  shipping_name: 'Test Buyer', shipping_line1: '1 Main St', shipping_city: 'Ann Arbor',
  shipping_state: 'MI', shipping_postal_code: '48104',
};

test('a shipped order with tracking sends one email with a USPS link', async () => {
  const { res, emails, updates } = await call({ order: shippedOrder });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sent, true);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'buyer@example.com');
  assert.match(emails[0].subject, /00042/);
  assert.match(emails[0].html, /tools\.usps\.com.*9400111899223197428490/);
  assert.equal(updates.length, 1);
  assert.ok(updates[0].shipping_email_sent_at);
});

test('wrong or missing secret is rejected before anything is read', async () => {
  for (const headers of [{}, { 'x-webhook-secret': 'nope' }]) {
    const { res, emails } = await call({ headers, order: shippedOrder });
    assert.equal(res.statusCode, 401);
    assert.equal(emails.length, 0);
  }
});

test('no email when already sent, not shipped, no tracking, or refunded', async () => {
  for (const patch of [
    { shipping_email_sent_at: '2026-10-07T00:00:00Z' },
    { fulfillment_status: 'pending' },
    { tracking_number: '' },
    { order_status: 'refunded' },
  ]) {
    const { res, emails, updates } = await call({ order: { ...shippedOrder, ...patch } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sent, false, JSON.stringify(patch));
    assert.equal(emails.length, 0);
    assert.equal(updates.length, 0);
  }
});
