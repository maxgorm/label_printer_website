import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PREORDER_CONFIG from './_config.js';
import { describePaper, parsePaperMetadata } from './_paper.js';

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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());

  const sig = req.headers['stripe-signature'];
  // Vercel may preserve whitespace pasted with the dashboard secret.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET.trim();

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

  return createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  return new Resend(process.env.RESEND_API_KEY.trim());
}

async function handleCheckoutCompleted(stripe, session) {
  const supabase = getSupabaseClient();
  const resend = getResendClient();

  // Customer and shipping details are regular Session fields, not expandable objects.
  const fullSession = await stripe.checkout.sessions.retrieve(session.id);

  if (fullSession.payment_status !== 'paid') {
    return;
  }

  const metadata = fullSession.metadata || {};
  const shipping = fullSession.shipping_details?.address || {};
  const customerEmail = fullSession.customer_details?.email;
  const customerName = fullSession.customer_details?.name || fullSession.shipping_details?.name || '';
  const quantity = parseInt(metadata.quantity, 10) || 1;
  const paperOnly = metadata.product_key === 'paper';
  const product = paperOnly ? null : (PREORDER_CONFIG.products[metadata.product_key] ||
    Object.values(PREORDER_CONFIG.products).find(({ slug }) => slug === metadata.product_slug) ||
    PREORDER_CONFIG.products[PREORDER_CONFIG.default_product]);
  const productName = paperOnly ? 'Sentimo Thermal Paper' : (metadata.product_name || product.name);
  const unitPrice = paperOnly ? null : (parseInt(metadata.unit_price_cents, 10) || product.unit_price_cents);
  const printerColors = paperOnly ? '' : formatPrinterColors(metadata.printer_colors);
  const colorCounts = paperOnly ? {} : parseColorCounts(metadata, product.printer_count, quantity);
  const paper = parsePaperMetadata(metadata);
  if (paperOnly && !Object.keys(paper.bundles).length) {
    throw new Error('Paper order is missing thermal paper bundles');
  }
  const paperSummary = describePaper(paper);
  const shippingAmount = fullSession.total_details?.amount_shipping ?? null;
  const totalAmount = fullSession.amount_total;

  // Stripe retries events. Read first so routine retries do not consume an order number.
  const { data: priorOrder, error: priorError } = await supabase.from('preorders')
    .select('id')
    .eq('stripe_checkout_session_id', fullSession.id)
    .maybeSingle();
  if (priorError) throw priorError;

  if (!priorOrder) {
    const { error: dbError } = await supabase.from('preorders').insert({
      stripe_checkout_session_id: fullSession.id,
      stripe_payment_intent_id: fullSession.payment_intent,
      stripe_customer_id: fullSession.customer || null,
      email: customerEmail,
      full_name: customerName,
      product_slug: paperOnly ? 'sentimo-paper' : (metadata.product_slug || product.slug),
      channel: 'web',
      color_counts: colorCounts,
      paper_bundles: paper.bundles,
      roll_counts: paper.rolls,
      shipping_amount: shippingAmount,
      source_created_at: new Date(fullSession.created * 1000).toISOString(),
      quantity: quantity,
      unit_price: unitPrice,
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
      notes: [
        printerColors ? `Printer colors: ${printerColors}` : '',
        paperSummary ? `Thermal paper: ${paperSummary}` : '',
      ].filter(Boolean).join(' | ') || null,
    });

    // A concurrent delivery can still race the read; the unique session ID is authoritative.
    if (dbError && dbError.code !== '23505') throw dbError;
  }

  const { data: savedOrder, error: readError } = await supabase
    .from('preorders')
    .select('id, order_number, confirmation_email_sent_at')
    .eq('stripe_checkout_session_id', fullSession.id)
    .single();
  if (readError || !savedOrder) throw readError || new Error('Saved order not found');

  // Send confirmation email
  if (customerEmail && !savedOrder.confirmation_email_sent_at) {
    if (!resend) throw new Error('Resend is not configured for order confirmations');
    const { error: emailError } = await resend.emails.send({
        from: PREORDER_CONFIG.confirmation_from,
        to: customerEmail,
        subject: 'Your Sentimo pre-order is confirmed',
        html: buildConfirmationEmail({
          name: customerName || 'there',
          orderNumber: savedOrder.order_number,
          productName,
          printerColors,
          paperSummary,
          shippingAmount: shippingAmount === null ? '' : (shippingAmount === 0 ? 'Free' : formatCurrency(shippingAmount, fullSession.currency)),
          quantity,
          amount: formatCurrency(totalAmount, fullSession.currency),
        }),
      }, { idempotencyKey: `sentimo-confirmation/${fullSession.id}` });
    if (emailError) throw emailError;
    const { error: updateError } = await supabase.from('preorders')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', savedOrder.id);
    if (updateError) throw updateError;
  }
}

async function handleRefund(charge) {
  const supabase = getSupabaseClient();
  const resend = getResendClient();

  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  const refundedAmount = charge.amount_refunded;
  const fullyRefunded = refundedAmount >= charge.amount;

  const { error: dbError } = await supabase
    .from('preorders')
    .update({
      order_status: fullyRefunded ? 'refunded' : 'partially_refunded',
      refund_status: fullyRefunded ? 'refunded' : 'partial',
      refund_amount: refundedAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (dbError) throw dbError;

  // Get the order to send refund email
  const { data: order, error: orderError } = await supabase
    .from('preorders')
    .select('id, email, full_name, order_number, total_amount, currency, refund_email_amount')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();
  if (orderError || !order) throw orderError || new Error('Refunded order not found');

  if (order.email && order.refund_email_amount !== refundedAmount) {
    if (!resend) throw new Error('Resend is not configured for refund confirmations');
    const { error: emailError } = await resend.emails.send({
        from: PREORDER_CONFIG.confirmation_from,
        to: order.email,
        subject: 'Your Sentimo refund has been processed',
        html: buildRefundEmail({
          name: order.full_name || 'there',
          orderNumber: order.order_number,
          amount: formatCurrency(refundedAmount, order.currency),
        }),
      }, { idempotencyKey: `sentimo-refund/${paymentIntentId}/${refundedAmount}` });
    if (emailError) throw emailError;
    const { error: updateError } = await supabase.from('preorders')
      .update({ refund_email_sent_at: new Date().toISOString(), refund_email_amount: refundedAmount })
      .eq('id', order.id);
    if (updateError) throw updateError;
  }
}

export function parseColorCounts(metadata, printerCount, packageQuantity) {
  const colors = [metadata.printer_color_1, metadata.printer_color_2]
    .filter(Boolean)
    .map((color) => String(color).trim().toLowerCase());
  if (colors.length !== printerCount ||
      colors.some((color) => !PREORDER_CONFIG.available_colors.includes(color))) {
    throw new Error('Checkout session is missing valid printer colors');
  }
  return colors.reduce((counts, color) => {
    counts[color] = (counts[color] || 0) + packageQuantity;
    return counts;
  }, {});
}

function formatCurrency(amountCents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatPrinterColors(value) {
  return String(value || '')
    .split(',')
    .map((color) => color.trim())
    .filter(Boolean)
    .map((color) => PREORDER_CONFIG.color_labels[color] || color)
    .join(', ');
}

function buildConfirmationEmail({ name, orderNumber, productName, printerColors, paperSummary, shippingAmount, quantity, amount }) {
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
        <p style="margin: 4px 0;"><strong>Product:</strong> ${escapeHtml(productName)}</p>
        ${printerColors ? `<p style="margin: 4px 0;"><strong>Printer color(s):</strong> ${escapeHtml(printerColors)}</p>` : ''}
        ${paperSummary ? `<p style="margin: 4px 0;"><strong>Thermal paper:</strong> ${escapeHtml(paperSummary)}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Quantity:</strong> ${quantity}</p>
        ${shippingAmount ? `<p style="margin: 4px 0;"><strong>Shipping:</strong> ${escapeHtml(shippingAmount)}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Amount paid:</strong> ${escapeHtml(amount)}</p>
      </div>
      <p>If you have any questions, contact us at <a href="mailto:${PREORDER_CONFIG.support_email}" style="color: #F53F7B;">${PREORDER_CONFIG.support_email}</a>.</p>
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
