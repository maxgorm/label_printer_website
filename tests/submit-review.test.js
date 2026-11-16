import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler, { validateReview } from '../api/submit-review.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');

const goodReview = {
  rating: 5,
  title: 'We love it',
  body: 'Printed a note for my girlfriend every morning.',
  name: 'Sam R.',
  email: 'Buyer@Example.com',
  order_number: '00042',
};

async function call(body, { env = {}, orders = [] } = {}) {
  const calls = { uploads: [], inserts: [], emails: [], removes: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    const method = (init.method || 'GET').toUpperCase();
    const json = (value, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (url.includes('api.resend.com')) {
      calls.emails.push(JSON.parse(init.body));
      return json({ id: 'email_test' });
    }
    if (url.includes('/storage/v1/object/review-photos') && method === 'POST') {
      calls.uploads.push(url);
      return json({ Key: url });
    }
    if (url.includes('/storage/v1/object/review-photos') && method === 'DELETE') {
      calls.removes.push(JSON.parse(init.body));
      return json([]);
    }
    if (url.includes('/rest/v1/preorders')) return json(orders);
    if (url.includes('/rest/v1/reviews') && method === 'POST') {
      calls.inserts.push(JSON.parse(init.body));
      return env.FAIL_INSERT ? json({ message: 'boom' }, 500) : new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
  const vars = {
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    RESEND_API_KEY: 're_placeholder',
    ...env,
  };
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader() {},
  };
  try {
    await handler({ method: 'POST', headers: {}, body }, res);
    return { res, ...calls };
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('validateReview enforces rating, required fields and limits', () => {
  assert.match(validateReview({ ...goodReview, rating: 0 }).error, /star rating/);
  assert.match(validateReview({ ...goodReview, rating: 4.5 }).error, /star rating/);
  assert.match(validateReview({ ...goodReview, title: '   ' }).error, /title/);
  assert.match(validateReview({ ...goodReview, title: 'x'.repeat(81) }).error, /80 characters/);
  assert.match(validateReview({ ...goodReview, body: 'x'.repeat(3001) }).error, /3000 characters/);
  assert.match(validateReview({ ...goodReview, email: 'nope' }).error, /email/);
  assert.match(validateReview({ ...goodReview, photos: Array(6).fill({ data: JPEG }) }).error, /up to 5/);
  assert.match(validateReview({ ...goodReview, photos: [{ data: Buffer.from('<svg/>').toString('base64') }] }).error, /JPEG, PNG or WebP/);
  const ok = validateReview({ ...goodReview, body: 'x'.repeat(3000), photos: [{ data: JPEG }] });
  assert.equal(ok.error, undefined);
  assert.equal(ok.review.email, 'buyer@example.com');
  assert.equal(ok.photos[0].type, 'image/jpeg');
});

test('saves the review with photos and returns the promo code', async () => {
  const { res, uploads, inserts, emails } = await call({ ...goodReview, photos: [{ data: JPEG }, { data: JPEG }] }, { orders: [{ id: 'o1' }] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, promo: { code: 'SPREADLOVE15', percent_off: 15, expires_label: 'February 1, 2027' } });
  assert.equal(uploads.length, 2);
  assert.equal(inserts.length, 1);
  const row = inserts[0];
  assert.equal(row.rating, 5);
  assert.equal(row.verified_purchase, true);
  assert.equal(row.photo_paths.length, 2);
  assert.match(row.photo_paths[0], new RegExp(`^${row.id}/1\\.jpg$`));
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'support@sentimonotes.com');
});

test('does not return the code when the review is invalid', async () => {
  const { res, inserts } = await call({ ...goodReview, rating: 9 });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.promo, undefined);
  assert.equal(inserts.length, 0);
});

test('does not return the code when saving fails, and cleans up photos', async () => {
  const { res, removes } = await call({ ...goodReview, photos: [{ data: JPEG }] }, { env: { FAIL_INSERT: '1' } });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.promo, undefined);
  assert.equal(removes.length, 1);
});

test('honeypot submissions are dropped without a code', async () => {
  const { res, inserts } = await call({ ...goodReview, website: 'http://spam.example' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.promo, undefined);
  assert.equal(inserts.length, 0);
});

test('returns 503 when Supabase is not configured', async () => {
  const { res } = await call(goodReview, { env: { SUPABASE_URL: undefined } });
  assert.equal(res.statusCode, 503);
});
