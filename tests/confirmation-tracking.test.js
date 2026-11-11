import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../public/order-confirmed.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*\/\/ Track checkout completion([\s\S]*?)<\/script>/)[1];
const session = 'cs_test_1234567890';

async function visit({ paid = true, consent = 'granted', storage = new Map(), meta = true } = {}) {
  const ga = [];
  const pixel = [];
  const localStorage = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) };
  const window = { location: { search: `?session_id=${session}` }, gtag: (...args) => ga.push(args) };
  if (meta) window.SentimoTrack = { consentState: () => consent, track: (...args) => { pixel.push(args); return consent === 'granted'; } };
  const purchase = paid ? { event_id: 'purchase_test', value: 49.99, currency: 'USD', contents: [{ id: 'sentimo-2-pack', quantity: 1 }] } : null;
  runInNewContext(script, { window, localStorage, URLSearchParams, encodeURIComponent,
    fetch: async () => ({ json: async () => ({ purchase }) }),
    setInterval: fn => setTimeout(fn, 0), clearInterval, setTimeout: () => 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  return { ga: JSON.parse(JSON.stringify(ga)), pixel: JSON.parse(JSON.stringify(pixel)), storage };
}

test('a verified paid order sends GA4 purchase and Meta purchase once per browser', async () => {
  const first = await visit();
  const ga = first.ga.find(args => args[1] === 'purchase');
  assert.deepEqual(ga[2], { transaction_id: session, value: 49.99, currency: 'USD', items: [{ item_id: 'sentimo-2-pack', quantity: 1 }] });
  assert.equal(first.pixel[0][0], 'Purchase');
  const again = await visit({ storage: first.storage });
  assert.equal(again.ga.filter(args => args[1] === 'purchase').length, 0);
  assert.equal(again.pixel.length, 0);
});

test('GA purchase is independent of Meta and unpaid orders are not reported', async () => {
  assert.equal((await visit({ meta: false })).ga.filter(args => args[1] === 'purchase').length, 1);
  assert.equal((await visit({ paid: false })).ga.filter(args => args[1] === 'purchase').length, 0);
});

