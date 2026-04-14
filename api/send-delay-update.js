import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PREORDER_CONFIG from './_config.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/send-delay-update
 * Body: { updated_timeline: "October 2026" }
 *
 * Admin-only endpoint to send delay update emails to all paid pre-orders.
 * Protect with ADMIN_API_KEY header in production.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple API key auth for admin endpoints
  const apiKey = req.headers['x-admin-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { updated_timeline } = req.body;
  if (!updated_timeline) {
    return res.status(400).json({ error: 'updated_timeline is required' });
  }

  try {
    // Get all paid, non-refunded orders
    const { data: orders, error: dbError } = await supabase
      .from('preorders')
      .select('email, full_name')
      .eq('order_status', 'paid')
      .is('refund_status', null);

    if (dbError) {
      console.error('Failed to fetch orders:', dbError);
      return res.status(500).json({ error: 'Database error' });
    }

    let sent = 0;
    let failed = 0;

    for (const order of orders || []) {
      try {
        await resend.emails.send({
          from: `Sentimo <orders@sentimonotes.com>`,
          to: order.email,
          subject: 'Update on your Sentimo pre-order',
          html: buildDelayEmail({
            name: order.full_name || 'there',
            updated_timeline,
          }),
        });
        sent++;
      } catch {
        failed++;
      }
    }

    return res.status(200).json({ sent, failed, total: (orders || []).length });
  } catch (error) {
    console.error('Delay update error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDelayEmail({ name, updated_timeline }) {
  return `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1F2937;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #F53F7B; font-size: 24px; margin: 0;">Sentimo</h1>
      </div>
      <h2 style="font-size: 20px; margin-bottom: 16px;">Update on your Sentimo pre-order</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We wanted to share an update on your Sentimo pre-order.</p>
      <p>Our shipping timeline has changed, and we now expect orders to begin shipping on or around <strong>${escapeHtml(updated_timeline)}</strong>.</p>
      <p>If you would prefer not to wait, you may request a full refund before your order ships by contacting us at <a href="mailto:${PREORDER_CONFIG.support_email}" style="color: #F53F7B;">${PREORDER_CONFIG.support_email}</a>.</p>
      <p>Thank you for your patience and support,<br />Sentimo</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">Sentimo™ is a trademark of Sentimo L.L.C.</p>
    </div>
  `;
}
