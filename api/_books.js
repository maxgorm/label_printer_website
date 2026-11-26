import { createClient } from '@supabase/supabase-js';
import PREORDER_CONFIG from './_config.js';

const BOOKS = PREORDER_CONFIG.memory_books;

function isBookVariant(variant) {
  return typeof variant === 'string' && Object.hasOwn(BOOKS, variant);
}

/**
 * Validate Memory Book selections sent by the browser: [{ variant, quantity }].
 * Only variant keys and quantities are accepted; prices come from the server config.
 * Returns { items: { variant: quantity } } or { error }.
 */
export function normalizeBookItems(input) {
  if (input === undefined || input === null) return { items: {} };
  if (!Array.isArray(input)) return { error: 'Invalid Memory Book selection' };

  const items = {};
  for (const entry of input) {
    const variant = entry?.variant;
    const quantity = Number(entry?.quantity);
    if (!isBookVariant(variant) || !Number.isInteger(quantity) || quantity < 1) {
      return { error: 'Invalid Memory Book selection' };
    }
    items[variant] = (items[variant] || 0) + quantity;
    if (items[variant] > PREORDER_CONFIG.memory_book_max_per_variant) {
      return { error: `You can order up to ${PREORDER_CONFIG.memory_book_max_per_variant} of each Memory Book option` };
    }
  }
  return { items };
}

/** Physical notebooks in a { variant: units } map (a Duo is two books). */
export function bookCountFor(items) {
  return Object.entries(items).reduce((sum, [variant, units]) => sum + BOOKS[variant].books * units, 0);
}

/** Read Memory Book units back out of Checkout Session metadata. */
export function parseBookMetadata(metadata = {}) {
  const items = {};
  if (metadata.memory_books) {
    let parsed;
    try {
      parsed = JSON.parse(metadata.memory_books);
    } catch {
      throw new Error('Checkout session has invalid Memory Book metadata');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Checkout session has invalid Memory Book metadata');
    }
    for (const [variant, units] of Object.entries(parsed)) {
      if (!isBookVariant(variant) || !Number.isInteger(units) || units < 1) {
        throw new Error('Checkout session has invalid Memory Book metadata');
      }
      items[variant] = units;
    }
  }
  return { items, books: bookCountFor(items) };
}

/** e.g. "1 × Memory Book Duo (2 books), 2 × Memory Book (2 books)". */
export function describeBooks(items) {
  return Object.entries(items).map(([variant, units]) => {
    const books = BOOKS[variant].books * units;
    return `${units} × ${BOOKS[variant].label} (${books} ${books === 1 ? 'book' : 'books'})`;
  }).join(', ');
}

/**
 * Block checkout when there are not enough notebooks. Single and Duo draw from the
 * same stock, so this compares total physical books. Skipped without Supabase, and
 * fails open on database errors (as paper does) so stock lookups never block printer sales.
 * Returns an error message or null.
 */
export async function findBookStockShortage(books) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || books <= 0) return null;
  try {
    const supabase = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
    const { data, error } = await supabase.from('book_stock').select('available_to_sell').maybeSingle();
    if (error) throw error;
    if ((data?.available_to_sell ?? 0) < books) {
      return 'Sorry, there are not enough Memory Books in stock for that selection. Please choose fewer books or remove them from your cart.';
    }
  } catch (err) {
    console.error('Memory Book stock check failed; allowing checkout:', err.message || err);
  }
  return null;
}
