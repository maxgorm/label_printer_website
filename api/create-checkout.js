import Stripe from 'stripe';
import PREORDER_CONFIG from './_config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key is not configured' });
  }

  const { quantity } = req.body;
  const qty = Math.max(1, Math.min(10, parseInt(quantity, 10) || 1));
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: PREORDER_CONFIG.currency,
            product_data: {
              name: PREORDER_CONFIG.product_name,
              description: PREORDER_CONFIG.product_description,
            },
            unit_amount: PREORDER_CONFIG.unit_price_cents,
          },
          quantity: qty,
        },
      ],
      metadata: {
        product_slug: PREORDER_CONFIG.product_slug,
        order_type: PREORDER_CONFIG.order_type,
        expected_ship: PREORDER_CONFIG.expected_ship_label,
        quantity: String(qty),
      },
      success_url: `${getBaseUrl(req)}${PREORDER_CONFIG.success_url}`,
      cancel_url: `${getBaseUrl(req)}${PREORDER_CONFIG.cancel_url}`,
      allow_promotion_codes: PREORDER_CONFIG.allow_promotion_codes,
      custom_text: {
        submit: {
          message: `This is a pre-order. Shipping is expected to begin in ${PREORDER_CONFIG.expected_ship_label}. ${PREORDER_CONFIG.refund_message}`,
        },
      },
    };

    // Collect shipping address if enabled
    if (PREORDER_CONFIG.collect_shipping) {
      sessionParams.shipping_address_collection = {
        allowed_countries: PREORDER_CONFIG.shipping_countries,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}
