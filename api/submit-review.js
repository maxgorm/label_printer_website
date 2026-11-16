/**
 * POST /api/submit-review
 * Stores a customer review (and up to MAX_PHOTOS photos) from the unlisted /reviews page,
 * then returns the thank-you promotion code. The code is only ever sent in this response.
 *
 * Body (JSON): { rating, title, body, name, email, order_number?, photos?: [{ type, data }], website? }
 * `photos[].data` is base64 (no data: prefix). The page downsizes photos before sending so
 * the request stays under Vercel's 4.5 MB body limit. `website` is a honeypot.
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PREORDER_CONFIG from './_config.js';

export const REVIEW_LIMITS = {
  title: 80,
  body: 3000,
  name: 60,
  order_number: 40,
  photos: 5,
  photo_bytes: 1_500_000,
};

const BUCKET = 'review-photos';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  // Drop control characters except newlines and tabs, normalise line endings.
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text.length > max ? null : text;
}

/** Detects JPEG / PNG / WebP from the file's first bytes; returns the MIME type or null. */
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Returns { review, photos } or { error }. */
export function validateReview(input = {}) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Please choose a star rating.' };

  const title = cleanText(input.title, REVIEW_LIMITS.title);
  if (title === null) return { error: `Please keep the title under ${REVIEW_LIMITS.title} characters.` };
  if (!title) return { error: 'Please add a title for your review.' };

  const body = cleanText(input.body, REVIEW_LIMITS.body);
  if (body === null) return { error: `Please keep your review under ${REVIEW_LIMITS.body} characters.` };
  if (!body) return { error: 'Please tell us a little about your experience.' };

  const name = cleanText(input.name, REVIEW_LIMITS.name);
  if (!name) return { error: 'Please add the name to show with your review.' };

  const email = cleanText(input.email, 254);
  if (!email || !EMAIL_RE.test(email)) return { error: 'Please enter a valid email address.' };

  const orderNumber = cleanText(input.order_number, REVIEW_LIMITS.order_number);
  if (orderNumber === null) return { error: 'That order number looks too long.' };

  const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
  if (rawPhotos.length > REVIEW_LIMITS.photos) return { error: `You can add up to ${REVIEW_LIMITS.photos} photos.` };
  const photos = [];
  for (const photo of rawPhotos) {
    if (!photo || typeof photo.data !== 'string') return { error: 'One of your photos could not be read.' };
    const buf = Buffer.from(photo.data, 'base64');
    if (!buf.length) return { error: 'One of your photos could not be read.' };
    if (buf.length > REVIEW_LIMITS.photo_bytes) return { error: 'One of your photos is too large. Please try a smaller one.' };
    const type = sniffImage(buf);
    if (!type) return { error: 'Photos must be JPEG, PNG or WebP images.' };
    photos.push({ buf, type });
  }

  return {
    review: { rating, title, body, display_name: name, email: email.toLowerCase(), order_number: orderNumber || null },
    photos,
  };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function promoResponse() {
  const { code, percent_off, expires_label } = PREORDER_CONFIG.review_promo;
  return { ok: true, promo: { code, percent_off, expires_label } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const input = req.body && typeof req.body === 'object' ? req.body : {};

  // Bots fill every field; people never see this one. Pretend it worked.
  if (typeof input.website === 'string' && input.website.trim()) {
    return res.status(200).json({ ok: true });
  }

  const { review, photos, error } = validateReview(input);
  if (error) return res.status(400).json({ error });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('submit-review: Supabase is not configured');
    return res.status(503).json({ error: 'Reviews are temporarily unavailable. Please try again later.' });
  }

  const supabase = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
  const id = randomUUID();
  const photoPaths = [];

  try {
    for (const [i, photo] of photos.entries()) {
      const path = `${id}/${i + 1}.${PHOTO_TYPES[photo.type]}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, photo.buf, {
        contentType: photo.type,
        upsert: false,
      });
      if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
      photoPaths.push(path);
    }

    // "Verified purchase" when this email has a paid order. Never blocks the review.
    let verified = false;
    try {
      const { data: orders } = await supabase.from('preorders')
        .select('id')
        .ilike('email', review.email.replace(/[%_\\]/g, '\\$&'))
        .in('order_status', ['paid', 'partially_refunded'])
        .limit(1);
      verified = Array.isArray(orders) && orders.length > 0;
    } catch (lookupError) {
      console.warn('submit-review: order lookup failed', lookupError);
    }

    const { error: insertError } = await supabase.from('reviews').insert({
      id,
      ...review,
      photo_paths: photoPaths,
      verified_purchase: verified,
    });
    if (insertError) throw new Error(`Review insert failed: ${insertError.message}`);

    // Let the team know a review came in. Optional; never blocks the response.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        await resend.emails.send({
          from: PREORDER_CONFIG.confirmation_from,
          to: PREORDER_CONFIG.support_email,
          replyTo: review.email,
          subject: `New ${review.rating}-star review: ${review.title}`,
          html: `<p style="font-size:20px;color:#F53F7B;margin:0">${stars}</p>
<h2 style="margin:8px 0">${escapeHtml(review.title)}</h2>
<p style="white-space:pre-wrap">${escapeHtml(review.body)}</p>
<p style="color:#6B7280;font-size:14px">${escapeHtml(review.display_name)} &lt;${escapeHtml(review.email)}&gt;${review.order_number ? ` · Order ${escapeHtml(review.order_number)}` : ''}<br>
${verified ? 'Verified purchase' : 'No matching paid order found'} · ${photoPaths.length} photo${photoPaths.length === 1 ? '' : 's'} · Review ID ${id}</p>`,
        });
      } catch (mailError) {
        console.warn('submit-review: notification email failed', mailError);
      }
    }

    return res.status(200).json(promoResponse());
  } catch (err) {
    console.error('submit-review:', err);
    if (photoPaths.length) {
      await supabase.storage.from(BUCKET).remove(photoPaths).catch(() => {});
    }
    return res.status(500).json({ error: 'Something went wrong saving your review. Please try again.' });
  }
}
