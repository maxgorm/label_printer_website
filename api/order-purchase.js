import Stripe from 'stripe';
import { commerceData, contentsFromMetadata, purchaseEventId, purchaseValueCents } from './_meta.js';

/**
 * Verified purchase details for the browser Purchase pixel on the confirmation page.
 * Stripe is asked directly, so a forged or reused URL cannot fabricate a purchase:
 * the session must exist and be paid. The event_id matches the server (CAPI) event.
 * Returns no personal data.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe is not configured' });

  const sessionId = String(req.query?.session_id || '');
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const valueCents = purchaseValueCents(session);
    if (session.payment_status !== 'paid' || valueCents <= 0) {
      return res.status(200).json({ purchase: null });
    }
    return res.status(200).json({
      purchase: {
        event_id: purchaseEventId(session.id),
        ...commerceData({
          contents: contentsFromMetadata(session.metadata),
          valueCents,
          currency: session.currency,
        }),
      },
    });
  } catch (err) {
    console.error('Order purchase lookup failed:', err.message || err);
    return res.status(200).json({ purchase: null });
  }
}
