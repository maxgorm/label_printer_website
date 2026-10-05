import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColorCounts } from '../api/webhook.js';

test('a three-pack order of two black printers reserves six black units', () => {
  assert.deepEqual(parseColorCounts({
    printer_color_1: 'Black', printer_color_2: 'Black',
  }, 2, 3), { black: 6 });
});

test('mixed colors reserve one of each for every package', () => {
  assert.deepEqual(parseColorCounts({
    printer_color_1: 'Pink', printer_color_2: 'White',
  }, 2, 2), { pink: 2, white: 2 });
});

test('missing or invalid colors stop a paid order from being recorded incorrectly', () => {
  assert.throws(() => parseColorCounts({ printer_color_1: 'Pink' }, 2, 1));
  assert.throws(() => parseColorCounts({ printer_color_1: 'Blue' }, 1, 1));
});
