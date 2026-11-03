# Performance and security fixes (2026-11-02)

Commit `789df09`, live on https://www.sentimonotes.com (Vercel Production reports that SHA).

## What changed

| Area | Before | After |
|---|---|---|
| Product video | `SentimoProductVid.mp4`, 1080p, 62.6 MB | `opt/SentimoProductVid-720p.mp4`, 720p H.264 with fast start, 5.5 MB |
| Social preview (og/twitter image) | `IMG_4321.JPG`, 6000x4000, 8.1 MB | `opt/og-image.jpg`, 1200x630, 96 KB, with og:image:width/height |
| Gallery images (7) | PNG, 1.2-1.9 MB each (~10.6 MB total) | WebP, 33-94 KB each (~460 KB total), same 1254x1254 size |
| Video poster, 404 and download photo | 8.1 MB JPG | `opt/printer-notes.webp`, 1600 px, 94 KB |
| App Store / Google Play badges | PNG up to 3840 px wide | WebP, 720 px, ~11 KB each |
| Tailwind | `cdn.tailwindcss.com` script compiling CSS in the browser | Prebuilt `tailwind-main.css` (46 KB) and `tailwind-alt.css` (21 KB) |
| Lazy loading (homepage) | 9 of 26 images | 24 of 26 (header logo and main carousel image stay eager) |
| Security headers | HSTS, nosniff, X-Frame-Options | Also Content-Security-Policy, Referrer-Policy, Permissions-Policy |

Notes:
- Optimized files use new names under `/assets/opt/` because `/assets/` is cached for a year. The originals are unchanged.
- Two Tailwind builds exist because four pages (404, download, support, faq) used Tailwind's default border radius and the rest used larger custom radii. Rebuild with `npm run build:css` after changing classes.
- The CSP allows the third parties the site uses: Google Analytics, Google Fonts, Stripe.js, Firebase Auth (password reset page), the Cloudflare Web Analytics beacon, and the payment logos hosted on lh3.googleusercontent.com.

## How it was verified

1. **Styles unchanged:** the computed styles of every element were compared between the old live site and the new build, on 9 pages at 1280 px and 390 px wide. There were no differences except sub-pixel (≤0.3 px) heights from the resized badges and video, and footer payment logos that now lazy-load.
2. **Functionality on the live site, with the real headers:** all pages load with 0 CSP violations, 0 console errors, 0 failed requests and 0 broken images, at desktop and mobile widths. The video plays the 720p file (readyState 4, 1280x720). Carousel thumbnails and the next button switch images. FAQ toggles work. Google Analytics is initialised.
3. **Order flow (locally, CSP enforced):** choosing printer colors enables the order button, and clicking it posts to `/api/create-checkout`. It only failed locally because there is no Stripe key on this machine.
4. **Structured data:** validator.schema.org on the live homepage shows WebSite and Product with 0 errors and 0 warnings (`screenshots/schema-validator-2026-11-02.jpg`).
5. **Unit tests:** `npm test` passes 49 of 49.

## Still needs you (requires sign-in)
- **Apex redirect:** in Vercel → label-printer-website → Settings → Domains, edit `sentimonotes.com` (redirect to `www.sentimonotes.com`) and change the status code from 307 to 308 (permanent).
- **Google Rich Results Test:** it now requires a Google sign-in. Run it on https://www.sentimonotes.com/.
- **Search Console:** submit `https://www.sentimonotes.com/sitemap.xml` under Sitemaps.
- **Cached 404:** one cached 404 exists for the bare URL `/assets/css/tailwind-main.css`. Pages request the `?v=` URL, which works, so visitors are not affected. Purging the Vercel cache clears it.
