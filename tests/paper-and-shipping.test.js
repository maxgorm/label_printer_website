import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePaperMetadata, rollCountsFor, mergeBundles, describePaper } from '../api/_paper.js';
import {
  INTERNATIONAL_RATES_CENTS, ZONES, isShippableCountry, shippingCentsFor, shippingCountryCodes, shippingOptionsForClient,
} from '../api/_shipping.js';
import { buildTrackingUrl, detectCarrier } from '../api/shipment-notify.js';

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
  assert.equal(shippingCentsFor({ subtotalCents: 2397 }), 499);
  assert.equal(shippingCentsFor({ subtotalCents: 2499 }), 499);
  assert.equal(shippingCentsFor({ subtotalCents: 2500 }), 0);
  assert.equal(shippingCentsFor({ country: 'US', subtotalCents: 2999 }), 0);
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

test('international orders never get the US flat or free rate', () => {
  for (const country of shippingCountryCodes().filter((code) => code !== 'US')) {
    for (const subtotalCents of [500, 2499, 2500, 9999, 100000]) {
      for (const hasPrinter of [true, false]) {
        const cents = shippingCentsFor({ country, subtotalCents, hasPrinter });
        assert.ok(cents > 499, `${country} ${subtotalCents} ${hasPrinter}: ${cents}`);
      }
    }
  }
  assert.ok(Object.values(INTERNATIONAL_RATES_CENTS).every((rate) => rate.light > 499 && rate.standard >= rate.light));
});

test('country list: US plus served countries, none of the embargoed ones', () => {
  assert.equal(isShippableCountry('US'), true);
  assert.equal(isShippableCountry('CA'), true);
  assert.equal(isShippableCountry('GB'), true);
  for (const blocked of ['KP', 'IR', 'CU', 'SY', 'RU', 'BY', 'XX', '', 'us']) {
    assert.equal(isShippableCountry(blocked), false, blocked);
  }
  const all = shippingCountryCodes();
  assert.equal(new Set(all).size, all.length, 'no country is listed in two zones');
  assert.ok(all.every((code) => /^[A-Z]{2}$/.test(code)));
  assert.equal(Object.keys(ZONES).length, Object.keys(INTERNATIONAL_RATES_CENTS).length);
});

test('client shipping options expose every country with its rates', () => {
  const options = shippingOptionsForClient();
  assert.equal(options.home, 'US');
  assert.equal(options.flat_cents, 499);
  assert.equal(options.free_threshold_cents, 2500);
  assert.equal(options.countries.length, shippingCountryCodes().length - 1);
  assert.ok(options.countries.every((c) => c.standard > 499 && c.light > 499));
});
