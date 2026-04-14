import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PREORDER_CONFIG from './_config.js';

// Disable body parsing so we can read the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Stripe webhook environment is not configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripe, event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error handling event ${event.type}:`, err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment is not configured');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  return new Resend(process.env.RESEND_API_KEY);
}

async function handleCheckoutCompleted(stripe, session) {
  const supabase = getSupabaseClient();
  const resend = getResendClient();

  // Retrieve the full session with line items
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items', 'customer_details', 'shipping_details'],
  });

  const metadata = fullSession.metadata || {};
  const shipping = fullSession.shipping_details?.address || {};
  const customerEmail = fullSession.customer_details?.email;
  const customerName = fullSession.customer_details?.name || fullSession.shipping_details?.name || '';
  const quantity = parseInt(metadata.quantity, 10) || 1;
  const totalAmount = fullSession.amount_total;

  // Insert order into Supabase
  const { error: dbError } = await supabase.from('preorders').insert({
    stripe_checkout_session_id: fullSession.id,
    stripe_payment_intent_id: fullSession.payment_intent,
    stripe_customer_id: fullSession.customer || null,
    email: customerEmail,
    full_name: customerName,
    product_slug: metadata.product_slug || PREORDER_CONFIG.product_slug,
    quantity: quantity,
    unit_price: PREORDER_CONFIG.unit_price_cents,
    total_amount: totalAmount,
    currency: fullSession.currency || PREORDER_CONFIG.currency,
    order_type: metadata.order_type || PREORDER_CONFIG.order_type,
    expected_ship_label: metadata.expected_ship || PREORDER_CONFIG.expected_ship_label,
    order_status: 'paid',
    fulfillment_status: 'pending',
    refund_status: null,
    refund_amount: null,
    shipping_name: customerName,
    shipping_line1: shipping.line1 || null,
    shipping_line2: shipping.line2 || null,
    shipping_city: shipping.city || null,
    shipping_state: shipping.state || null,
    shipping_postal_code: shipping.postal_code || null,
    shipping_country: shipping.country || null,
  });

  if (dbError) {
    console.error('Failed to insert preorder:', dbError);
  }

  // Send confirmation email
  if (customerEmail && resend) {
    try {
      await resend.emails.send({
        from: `Sentimo <orders@sentimonotes.com>`,
        to: customerEmail,
        subject: 'Your Sentimo pre-order is confirmed',
        html: buildConfirmationEmail({
          name: customerName || 'there',
          orderNumber: fullSession.id.slice(-8).toUpperCase(),
          quantity,
          amount: formatCurrency(totalAmount, fullSession.currency),
        }),
      });
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr);
    }
  }
}

async function handleRefund(charge) {
  const supabase = getSupabaseClient();
  const resend = getResendClient();

  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  const refundedAmount = charge.amount_refunded;

  const { error: dbError } = await supabase
    .from('preorders')
    .update({
      order_status: 'refunded',
      refund_status: 'refunded',
      refund_amount: refundedAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (dbError) {
    console.error('Failed to update refund status:', dbError);
  }

  // Get the order to send refund email
  const { data: order } = await supabase
    .from('preorders')
    .select('email, full_name, stripe_checkout_session_id, total_amount, currency')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (order?.email && resend) {
    try {
      await resend.emails.send({
        from: `Sentimo <orders@sentimonotes.com>`,
        to: order.email,
        subject: 'Your Sentimo refund has been processed',
        html: buildRefundEmail({
          name: order.full_name || 'there',
          orderNumber: order.stripe_checkout_session_id?.slice(-8).toUpperCase() || '',
          amount: formatCurrency(refundedAmount, order.currency),
        }),
      });
    } catch (emailErr) {
      console.error('Failed to send refund email:', emailErr);
    }
  }
}

function formatCurrency(amountCents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function buildConfirmationEmail({ name, orderNumber, quantity, amount }) {
  return `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1F2937;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #F53F7B; font-size: 24px; margin: 0;">Sentimo</h1>
      </div>
      <h2 style="font-size: 20px; margin-bottom: 16px;">Your pre-order is confirmed</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for reserving Sentimo.</p>
      <p>Your pre-order has been received and confirmed. Sentimo is expected to begin shipping in ${PREORDER_CONFIG.expected_ship_label}.</p>
      <p>We'll send you updates as production progresses. If we are unable to fulfill your order, you will receive a full refund.</p>
      <div style="background: #FFF9F5; border: 1px solid #FFE8F0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Order summary</h3>
        <p style="margin: 4px 0;"><strong>Order number:</strong> ${escapeHtml(orderNumber)}</p>
        <p style="margin: 4px 0;"><strong>Product:</strong> Sentimo 2-Pack</p>
        <p style="margin: 4px 0;"><strong>Quantity:</strong> ${quantity}</p>
        <p style="margin: 4px 0;"><strong>Amount paid:</strong> ${escapeHtml(amount)}</p>
      </div>
      <p>If you have any questions, reply to this email or contact us at <a href="mailto:${PREORDER_CONFIG.support_email}" style="color: #F53F7B;">${PREORDER_CONFIG.support_email}</a>.</p>
      <p>Thank you,<br />Sentimo</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">Sentimo™ is a trademark of Sentimo L.L.C.</p>
    </div>
  `;
}

function buildRefundEmail({ name, orderNumber, amount }) {
  return `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1F2937;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #F53F7B; font-size: 24px; margin: 0;">Sentimo</h1>
      </div>
      <h2 style="font-size: 20px; margin-bottom: 16px;">Your refund has been processed</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your refund for Sentimo has been processed to your original payment method.</p>
      <div style="background: #FFF9F5; border: 1px solid #FFE8F0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Refund details</h3>
        <p style="margin: 4px 0;"><strong>Order number:</strong> ${escapeHtml(orderNumber)}</p>
        <p style="margin: 4px 0;"><strong>Amount refunded:</strong> ${escapeHtml(amount)}</p>
      </div>
      <p>Please allow your payment provider time to post the refund to your account.</p>
      <p>Thank you,<br />Sentimo</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">Sentimo™ is a trademark of Sentimo L.L.C.</p>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
