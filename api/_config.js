/**
 * Sentimo Pre-Order Configuration
 * ================================
 * Central config for price, shipping date, product info, and copy.
 * Change values here to update across the entire pre-order system.
 */

const PREORDER_CONFIG = {
  // Products and pricing (in cents for Stripe). The duo is the default offer.
  // `unit_price_cents` is the sale price, charged until `sale_ends_at`; from then on
  // checkout charges `regular_price_cents` (use promotion codes for discounts after that).
  // Keep the date and prices in sync with public/assets/js/preorder.js.
  sale_ends_at: '2026-12-01T00:00:00-05:00', // midnight US Eastern, Dec 1
  sale_ends_label: '12/1',
  products: {
    single: {
      name: 'Sentimo Single Printer',
      slug: 'sentimo-single',
      description: 'Sentimo — 1 Printer + Starter Kit.',
      unit_price_cents: 2999,
      regular_price_cents: 4999,
      display_price: '$29.99',
      original_price: '$49.99',
      printer_count: 1,
    },
    duo: {
      name: 'Sentimo 2-Pack',
      slug: 'sentimo-2-pack',
      description: 'Sentimo — 2 Printers + Starter Kit.',
      unit_price_cents: 4999,
      regular_price_cents: 6999,
      display_price: '$49.99',
      original_price: '$69.99',
      printer_count: 2,
    },
  },
  default_product: 'duo',
  available_colors: ['pink', 'white', 'black'],
  color_labels: {
    pink: 'Pink',
    white: 'White',
    black: 'Black',
  },
  // Thermal paper packs. `rolls` is the per-color roll count in one pack and drives
  // paper inventory in Supabase. `addon_price_cents` is the one-per-order discounted
  // price offered when a printer order has no paper. Retired packs can no longer be
  // bought, but stay here so checkouts started before they were retired still record.
  paper_bundles: {
    classic: {
      name: 'Sentimo Thermal Paper: Classic',
      label: 'Classic',
      slug: 'paper-classic',
      description: '3 rolls of white thermal sticker paper.',
      roll_summary: '3 white rolls',
      price_cents: 699,
      addon_price_cents: 499,
      rolls: { white: 3 },
    },
    dreamy: {
      name: 'Sentimo Thermal Paper: Dreamy',
      label: 'Dreamy',
      slug: 'paper-dreamy',
      description: '5 rolls of thermal sticker paper: white, lavender, yellow, pink, and blue.',
      roll_summary: 'White, lavender, yellow, pink, blue',
      price_cents: 999,
      addon_price_cents: 699,
      rolls: { white: 1, lavender: 1, yellow: 1, pink: 1, blue: 1 },
    },
    sweet: {
      name: 'Sentimo Thermal Paper: Sweet',
      label: 'Sweet',
      slug: 'paper-sweet',
      description: '3 rolls of thermal sticker paper: pink, purple, and yellow.',
      roll_summary: 'Pink + purple + yellow',
      price_cents: 899,
      addon_price_cents: 499,
      rolls: { pink: 1, purple: 1, yellow: 1 },
      retired: true,
    },
    bright: {
      name: 'Sentimo Thermal Paper: Bright',
      label: 'Bright',
      slug: 'paper-bright',
      description: '3 rolls of thermal sticker paper: mint, blue, and orange.',
      roll_summary: 'Mint + blue + orange',
      price_cents: 899,
      addon_price_cents: 499,
      rolls: { mint: 1, blue: 1, orange: 1 },
      retired: true,
    },
  },
  paper_roll_colors: ['white', 'lavender', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange'],
  // One discounted add-on pack per order, only when the order includes a printer.
  paper_addon_max_per_order: 1,
  paper_max_per_bundle: 10,
  // Tax category for paper packs (general tangible goods).
  paper_tax_code: 'txcd_99999999',

  // Memory Books: A6 kraft notebooks, sold one at a time or as a matching pair.
  // `books` is how many physical notebooks one unit contains; both variants draw from
  // the same notebook stock in Supabase (book_movements / book_stock). Quantities are
  // per order, like paper packs (not multiplied by the number of printer sets).
  // Each notebook weighs about 34 g, well inside a printer parcel, so books never add a
  // shipping charge: shipping stays the existing flat/free rate for the order.
  // Keep prices in sync with public/assets/js/cart.js.
  memory_books: {
    single: {
      name: 'Sentimo Memory Book',
      label: 'Memory Book',
      sku: 'MEMORY-BOOK-1',
      slug: 'memory-book-single',
      description: 'One A6 kraft notebook, 48 blank pages.',
      price_cents: 499,
      books: 1,
    },
    duo: {
      name: 'Sentimo Memory Book Duo',
      label: 'Memory Book Duo',
      sku: 'MEMORY-BOOK-2',
      slug: 'memory-book-duo',
      description: 'Two matching A6 kraft notebooks, 48 blank pages each.',
      price_cents: 799,
      books: 2,
    },
  },
  memory_book_max_per_variant: 10,
  // Notebooks are general tangible goods for Stripe Tax.
  memory_book_tax_code: 'txcd_99999999',

  // US shipping: flat fee below the threshold (pre-tax subtotal), free at or above it.
  shipping_flat_cents: 499,
  free_shipping_threshold_cents: 2500,
  shipping_tax_code: 'txcd_92010001',

  // International shipping: one flat fee per order, never free. Countries not
  // listed here (or US) cannot check out. Keep in sync with public/assets/js/shipping.js.
  international_shipping_cents: {
    CA: 1499,
    GB: 1999,
    DE: 1999,
    FR: 1999,
    NL: 1999,
    BE: 1999,
    IE: 1999,
    MX: 1999,
    IT: 2499,
    ES: 2499,
    SE: 2499,
    DK: 2499,
    AU: 2499,
    NZ: 2499,
    JP: 2499,
    KR: 2499,
    SG: 2499,
  },
  international_ship_label: '5-14 days',
  duties_message: 'Duties and taxes are the buyer’s responsibility.',

  currency: 'usd',
  // Stripe Tax: Consumer Electronics (physical devices for personal use).
  // https://docs.stripe.com/tax/tax-codes
  product_tax_code: 'txcd_34020027',

  // Shipping timeline
  expected_ship_label: '2-5 days',

  // Order type
  order_type: 'preorder',

  // URLs
  success_url: '/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}',
  // The cart reopens when a shopper backs out of Stripe Checkout.
  cancel_url: '/#cart',

  // Support
  support_email: 'support@sentimonotes.com',
  confirmation_from: 'Sentimo <noreply@sentimonotes.com>',

  // Refund copy
  refund_message: 'If we are unable to fulfill your order, you will receive a full refund.',

  // Stripe allows promo codes
  allow_promotion_codes: true,

  // Thank-you code shown on /reviews only after a review is submitted. It is a Stripe
  // promotion code on the "Review Discount" coupon (15% off, once). It lives server-side
  // so it is not in the page source. Keep the expiry label in sync with Stripe.
  review_promo: {
    code: 'SPREADLOVE15',
    percent_off: 15,
    expires_label: 'February 1, 2027',
  },

  // Collect shipping address in Stripe Checkout
  collect_shipping: true,

};

// Shipping countries (ISO 3166-1 alpha-2)
PREORDER_CONFIG.shipping_countries = ['US', ...Object.keys(PREORDER_CONFIG.international_shipping_cents)];

/** Printer price in cents at `now`: the sale price until sale_ends_at, then the regular price. */
export function printerPriceCents(product, now = new Date()) {
  return now < new Date(PREORDER_CONFIG.sale_ends_at) ? product.unit_price_cents : product.regular_price_cents;
}

export default PREORDER_CONFIG;
