/**
 * The visitor's country from Vercel's IP geolocation header, used to preselect
 * the shipping destination. No browser location permission is involved.
 * Returns { country: 'GB' } or { country: null } (for example on localhost).
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  return res.status(200).json({ country: /^[A-Z]{2}$/.test(country) ? country : null });
}
