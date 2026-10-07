/**
 * Sentimo Pre-Order Configuration
 * ================================
 * Central config for price, shipping date, product info, and copy.
 * Change values here to update across the entire pre-order system.
 */

const PREORDER_CONFIG = {
  // Products and pricing (in cents for Stripe). The duo is the default offer.
  products: {
    single: {
      name: 'Sentimo Single Printer',
      slug: 'sentimo-single',
      description: 'Sentimo Pre-Order — 1 Printer + Starter Kit. Expected to ship Fall 2026.',
      unit_price_cents: 2999,
      display_price: '$29.99',
      original_price: '$49.99',
      printer_count: 1,
    },
    duo: {
      name: 'Sentimo 2-Pack',
      slug: 'sentimo-2-pack',
      description: 'Sentimo Pre-Order — 2 Printers + Starter Kit. Expected to ship Fall 2026.',
      unit_price_cents: 4999,
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
  // Thermal paper: each bundle is one pack of 3 rolls. `rolls` is the per-color roll
  // count in one pack and drives paper inventory in Supabase.
  paper_bundles: {
    classic: {
      name: 'Sentimo Thermal Paper: Classic',
      label: 'Classic',
      slug: 'paper-classic',
      description: '3 rolls of white thermal sticker paper.',
      roll_summary: '3 white rolls',
      price_cents: 799,
      rolls: { white: 3 },
    },
    sweet: {
      name: 'Sentimo Thermal Paper: Sweet',
      label: 'Sweet',
      slug: 'paper-sweet',
      description: '3 rolls of thermal sticker paper: pink, purple, and yellow.',
      roll_summary: 'Pink + purple + yellow',
      price_cents: 899,
      rolls: { pink: 1, purple: 1, yellow: 1 },
    },
    bright: {
      name: 'Sentimo Thermal Paper: Bright',
      label: 'Bright',
      slug: 'paper-bright',
      description: '3 rolls of thermal sticker paper: mint, blue, and orange.',
      roll_summary: 'Mint + blue + orange',
      price_cents: 899,
      rolls: { mint: 1, blue: 1, orange: 1 },
    },
  },
  paper_roll_colors: ['white', 'pink', 'purple', 'yellow', 'mint', 'blue', 'orange'],
  // One discounted add-on pack per order, only when the order includes a printer.
  paper_addon_price_cents: 499,
  paper_addon_max_per_order: 1,
  paper_max_per_bundle: 10,
  // Tax category for paper packs (general tangible goods).
  paper_tax_code: 'txcd_99999999',

  // Shipping: flat fee below the threshold (pre-tax subtotal), free at or above it.
  shipping_flat_cents: 499,
  free_shipping_threshold_cents: 2500,
  shipping_tax_code: 'txcd_92010001',

  currency: 'usd',
  // Stripe Tax: Consumer Electronics (physical devices for personal use).
  // https://docs.stripe.com/tax/tax-codes
  product_tax_code: 'txcd_34020027',

  // Shipping timeline
  expected_ship_label: 'Fall 2026',

  // Order type
  order_type: 'preorder',

  // URLs
  success_url: '/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: '/#reserve',

  // Support
  support_email: 'support@sentimonotes.com',
  confirmation_from: 'Sentimo <noreply@sentimonotes.com>',

  // Refund copy
  refund_message: 'If we are unable to fulfill your order, you will receive a full refund.',

  // Stripe allows promo codes
  allow_promotion_codes: true,

  // Collect shipping address in Stripe Checkout
  collect_shipping: true,

  // Destination countries and international rates live in api/_shipping.js.
};

export default PREORDER_CONFIG;
