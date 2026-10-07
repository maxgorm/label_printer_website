import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PREORDER_CONFIG from './_config.js';

/**
 * POST /api/shipment-notify
 *
 * Called by a Supabase Database Webhook (table `preorders`, event UPDATE) with the
 * header `x-webhook-secret: $SHIPMENT_WEBHOOK_SECRET`. To ship an order, set
 * `tracking_number` (and optionally `tracking_carrier`) and set
 * `fulfillment_status` to `shipped` in Supabase. The customer is emailed once the
 * order is shipped and has a tracking number, and never more than once.
 *
 * The payload is only used to find the order; every decision is made from the
 * row re-read from the database.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedSecret = process.env.SHIPMENT_WEBHOOK_SECRET?.trim();
  if (!expectedSecret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Shipment notifications are not configured' });
  }
  if (!safeEqual(String(req.headers['x-webhook-secret'] || ''), expectedSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const orderId = req.body?.record?.id;
  if (!orderId) {
    return res.status(400).json({ error: 'Missing order record' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
    const { data: order, error } = await supabase
      .from('preorders')
      .select('id, email, full_name, order_number, order_status, fulfillment_status, tracking_carrier, tracking_number, shipping_email_sent_at, shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, notes')
      .eq('id', orderId)
      .single();
    if (error || !order) throw error || new Error('Order not found');

    const trackingNumber = String(order.tracking_number || '').trim();
    const shipped = ['shipped', 'fulfilled'].includes(order.fulfillment_status);
    const refunded = !['paid', 'partially_refunded'].includes(order.order_status);
    if (!shipped || !trackingNumber || !order.email || refunded || order.shipping_email_sent_at) {
      return res.status(200).json({ sent: false });
    }

    const carrier = String(order.tracking_carrier || '').trim().toLowerCase() || detectCarrier(trackingNumber);
    const resend = new Resend(process.env.RESEND_API_KEY.trim());
    const { error: emailError } = await resend.emails.send({
      from: PREORDER_CONFIG.confirmation_from,
      to: order.email,
      subject: `Your Sentimo order ${order.order_number} has shipped`,
      html: buildShippedEmail({
        name: order.full_name || 'there',
        orderNumber: order.order_number,
        carrier,
        trackingNumber,
        trackingUrl: buildTrackingUrl(carrier, trackingNumber),
        address: formatAddress(order),
      }),
    }, { idempotencyKey: `sentimo-shipped/${order.id}/${trackingNumber}` });
    if (emailError) throw emailError;

    const { error: updateError } = await supabase.from('preorders')
      .update({ shipping_email_sent_at: new Date().toISOString() })
      .eq('id', order.id);
    if (updateError) throw updateError;

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Shipment notification failed:', err);
    return res.status(500).json({ error: 'Shipment notification failed' });
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const CARRIER_LABELS = { usps: 'USPS', ups: 'UPS', fedex: 'FedEx' };

export function detectCarrier(trackingNumber) {
  const value = String(trackingNumber).replace(/\s+/g, '').toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(value)) return 'ups';
  if (/^(9[2345]\d{18,24}|[A-Z]{2}\d{9}US)$/.test(value)) return 'usps';
  if (/^(\d{12}|\d{15})$/.test(value)) return 'fedex';
  return 'other';
}

export function buildTrackingUrl(carrier, trackingNumber) {
  const number = encodeURIComponent(String(trackingNumber).replace(/\s+/g, ''));
  switch (carrier) {
    case 'usps': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
    case 'ups': return `https://www.ups.com/track?tracknum=${number}`;
    case 'fedex': return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
    default: return null;
  }
}

function formatAddress(order) {
  const cityLine = [order.shipping_city, order.shipping_state, order.shipping_postal_code].filter(Boolean).join(' ');
  return [order.shipping_name || order.full_name, order.shipping_line1, order.shipping_line2, cityLine]
    .filter(Boolean)
    .join(', ');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildShippedEmail({ name, orderNumber, carrier, trackingNumber, trackingUrl, address }) {
  const carrierLabel = CARRIER_LABELS[carrier] || 'Carrier';
  return `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1F2937;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #F53F7B; font-size: 24px; margin: 0;">Sentimo</h1>
      </div>
      <h2 style="font-size: 20px; margin-bottom: 16px;">Your order is on its way</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Good news! Your Sentimo order has shipped.</p>
      <div style="background: #FFF9F5; border: 1px solid #FFE8F0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Shipment details</h3>
        <p style="margin: 4px 0;"><strong>Order number:</strong> ${escapeHtml(orderNumber)}</p>
        <p style="margin: 4px 0;"><strong>Carrier:</strong> ${escapeHtml(carrierLabel)}</p>
        <p style="margin: 4px 0;"><strong>Tracking number:</strong> ${escapeHtml(trackingNumber)}</p>
        ${address ? `<p style="margin: 4px 0;"><strong>Shipping to:</strong> ${escapeHtml(address)}</p>` : ''}
      </div>
      ${trackingUrl ? `<p style="text-align: center; margin: 28px 0;"><a href="${escapeHtml(trackingUrl)}" style="background: #F53F7B; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 600; display: inline-block;">Track your package</a></p>` : ''}
      <p>Tracking details can take a few hours to appear after a label is created. If you have any questions, contact us at <a href="mailto:${PREORDER_CONFIG.support_email}" style="color: #F53F7B;">${PREORDER_CONFIG.support_email}</a>.</p>
      <p>Thank you,<br />Sentimo</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">Sentimo™ is a trademark of Sentimo L.L.C.</p>
    </div>
  `;
}
