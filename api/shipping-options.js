import { shippingOptionsForClient } from './_shipping.js';

/** GET /api/shipping-options: destinations and shipping rates for the order form. */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json(shippingOptionsForClient());
}
