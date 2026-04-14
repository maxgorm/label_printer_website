/**
 * Sentimo Pre-Order Configuration
 * ================================
 * Central config for price, shipping date, product info, and copy.
 * Change values here to update across the entire pre-order system.
 */

const PREORDER_CONFIG = {
  // Product
  product_name: 'Sentimo 2-Pack',
  product_slug: 'sentimo-2-pack',
  product_description: 'Sentimo Pre-Order — 2 Printers + Starter Kit. Expected to ship August 2026.',

  // Pricing (in cents for Stripe)
  unit_price_cents: 3900,
  currency: 'usd',

  // Display price
  display_price: '$39',

  // Shipping timeline
  expected_ship_label: 'August 2026',

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
