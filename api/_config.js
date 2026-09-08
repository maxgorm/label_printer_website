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
      unit_price_cents: 2900,
      display_price: '$29',
      original_price: '$49',
      printer_count: 1,
    },
    duo: {
      name: 'Sentimo 2-Pack',
      slug: 'sentimo-2-pack',
      description: 'Sentimo Pre-Order — 2 Printers + Starter Kit. Expected to ship Fall 2026.',
      unit_price_cents: 4900,
      display_price: '$49',
      original_price: '$69',
      printer_count: 2,
    },
  },
  default_product: 'duo',
  currency: 'usd',

  // Shipping timeline
  expected_ship_label: 'Fall 2026',

  // Order type
  order_type: 'preorder',

  // URLs
  success_url: '/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: '/#reserve',

  // Support
  support_email: 'support@sentimonotes.com',

  // Refund copy
  refund_message: 'If we are unable to fulfill your order, you will receive a full refund.',

  // Stripe allows promo codes
  allow_promotion_codes: true,

  // Collect shipping address in Stripe Checkout
  collect_shipping: true,

  // Shipping countries (ISO 3166-1 alpha-2)
  shipping_countries: ['US'],
};

export default PREORDER_CONFIG;
