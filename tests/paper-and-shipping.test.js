import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePaperMetadata, rollCountsFor, mergeBundles, shippingCentsFor, normalizeShippingCountry, describePaper } from '../api/_paper.js';
import { buildTrackingUrl, detectCarrier } from '../api/shipment-notify.js';
import geoHandler from '../api/geo.js';

test('bundles expand into individual rolls per color', () => {
  assert.deepEqual(rollCountsFor({ classic: 2 }), { white: 6 });
  assert.deepEqual(rollCountsFor({ sweet: 1, bright: 2 }), {
    pink: 1, purple: 1, yellow: 1, mint: 2, blue: 2, orange: 2,
  });
});

test('starting stock supports 13 Classic packs and 12 each of Sweet and Bright', () => {
  // 39 white rolls, 12 of each other color (see migration_005).
  assert.equal(Math.floor(39 / rollCountsFor({ classic: 1 }).white), 13);
  assert.equal(Math.floor(12 / rollCountsFor({ sweet: 1 }).pink), 12);
  assert.equal(Math.floor(12 / rollCountsFor({ bright: 1 }).mint), 12);
});

test('paper metadata round-trips, including the add-on pack', () => {
  const parsed = parsePaperMetadata({ paper_bundles: JSON.stringify({ classic: 1 }), paper_addon: 'sweet' });
  assert.deepEqual(parsed.bundles, { classic: 1, sweet: 1 });
  assert.deepEqual(parsed.rolls, { white: 3, pink: 1, purple: 1, yellow: 1 });
  assert.equal(describePaper(parsed), '1 × Classic (3 rolls), 1 × Sweet (3 rolls, add-on price)');
  assert.deepEqual(mergeBundles({ sweet: 1 }, 'sweet'), { sweet: 2 });
});

test('orders without paper parse to nothing, and bad metadata is rejected', () => {
  assert.deepEqual(parsePaperMetadata({}).bundles, {});
  assert.throws(() => parsePaperMetadata({ paper_bundles: 'not json' }));
  assert.throws(() => parsePaperMetadata({ paper_bundles: JSON.stringify({ gold: 1 }) }));
  assert.throws(() => parsePaperMetadata({ paper_addon: 'gold' }));
});

test('shipping is $4.99 under $25 and free at $25 or more', () => {
  assert.equal(shippingCentsFor(2397), 499);
  assert.equal(shippingCentsFor(2499), 499);
  assert.equal(shippingCentsFor(2500), 0);
  assert.equal(shippingCentsFor(2999), 0);
  assert.equal(shippingCentsFor(2999, 'US'), 0);
});

test('international shipping is a flat fee per country, never free', () => {
  assert.equal(shippingCentsFor(500, 'CA'), 1499);
  assert.equal(shippingCentsFor(9999, 'CA'), 1499);
  assert.equal(shippingCentsFor(9999, 'GB'), 1999);
  assert.equal(shippingCentsFor(9999, 'MX'), 1999);
  assert.equal(shippingCentsFor(9999, 'SG'), 2499);
  assert.equal(normalizeShippingCountry(undefined), 'US');
  assert.equal(normalizeShippingCountry(' jp '), 'JP');
  assert.equal(normalizeShippingCountry('BR'), null);
});

test('geo endpoint returns the Vercel IP country or null', () => {
  const call = (headers) => {
    const res = {
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    geoHandler({ headers }, res);
    return res;
  };
  assert.deepEqual(call({ 'x-vercel-ip-country': 'gb' }).body, { country: 'GB' });
  assert.deepEqual(call({}).body, { country: null });
  assert.deepEqual(call({ 'x-vercel-ip-country': 'not-a-country' }).body, { country: null });
  assert.equal(call({}).headers['Cache-Control'], 'private, no-store');
});

test('tracking links and carrier detection', () => {
  assert.equal(detectCarrier('1Z999AA10123456784'), 'ups');
  assert.equal(detectCarrier('9400111899223197428490'), 'usps');
  assert.equal(detectCarrier('123456789012'), 'fedex');
  assert.equal(detectCarrier('abc'), 'other');
  assert.equal(buildTrackingUrl('usps', '9400 1118 9922'), 'https://tools.usps.com/go/TrackConfirmAction?tLabels=940011189922');
  assert.equal(buildTrackingUrl('ups', '1Z999AA10123456784'), 'https://www.ups.com/track?tracknum=1Z999AA10123456784');
  assert.equal(buildTrackingUrl('other', 'x'), null);
});
