# Fix round 3: speed, accessibility and meta (2026-11-02/03)

Commits `21fa694` and `9f19538`, live on https://www.sentimonotes.com.

## Lighthouse on the live homepage

| | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Page weight |
|---|---|---|---|---|---|---|---|---|---|
| Mobile, before | 58 | 89 | 79 | 92 | 4.5 s | 6.8 s | 200 ms | 0 | 1.1 MB |
| **Mobile, after** | **97** | **96** | **100** | 92 | 1.7 s | **2.4 s** | 80 ms | 0 | 0.4 MB |
| Desktop, before | 98 | 89 | 78 | 92 | 0.8 s | 0.9 s | 10 ms | 0 | 4.6 MB |
| **Desktop, after** | **100** | **96** | **100** | 92 | 0.5 s | 0.5 s | 0 ms | 0 | 3.6 MB |

## What changed

- **Broken Google Fonts request removed.** The DM Sans and Playfair Display URL has returned HTTP 400 since February 2026 (invalid `opsz` value). Those fonts never loaded, so the site has always shown the system fallback fonts. The request only blocked rendering. Removing it keeps the site looking exactly the same.
- **Icon font self-hosted:** Material Icons Round, cut down to the icon names in the site's HTML and JS. It's 12 KB instead of 174 KB and is preloaded. If you add a new icon name, regenerate the subset (`/assets/fonts/material-icons-round-sentimo.woff2`).
- **Stripe.js removed** from the homepage. Checkout redirects to Stripe's hosted page, so the 259 KB script and its third-party cookie were unused.
- **Logo** is now a 364x84 WebP (12 KB instead of 73 KB). The structured data still points to the original PNG.
- **Gallery images:**
  - Thumbnails now use 160 px images (2-6 KB) instead of full 1254 px images.
  - The main carousel image has `srcset` sizes (400/800/1254 px), and the carousel script updates them when the slide changes.
  - The main image is now lazy-loaded.
- **Video** uses `preload="none"`.
  - Desktop still autoplays it on purpose (`main.js`), so it still downloads there.
  - The poster is unchanged, and tapping play on mobile works.
- **Accessibility:**
  - Removed `aria-checked` from the product and color picker labels. The radio inputs inside them already carry the state.
  - Changed h4 headings that skipped a level to h3. They look identical.
- **Meta:** new titles and descriptions for FAQ, Privacy and Terms. The homepage title was left alone, as you asked.

## Verification
- **Visuals:** the computed styles of every element on 10 pages, at 1280 px and 390 px, are identical to the previous live site.
- **Functionality on the live site, real headers:**
  - 0 CSP violations, 0 console errors and 0 broken images on all pages.
  - Icons render, the carousel and thumbnails switch, the FAQ toggles work, and analytics loads.
  - The order button posts to checkout. This was tested locally.
- **Unit tests:** 49 of 49 pass.

## Incident during deploy (resolved)
I checked the new asset URLs before the production deploy had finished. The CDN cached 404s and old files under those URLs, and because `/assets/` is cached for a year, the first deploy (`21fa694`) showed **broken icons for a few minutes**. Commit `9f19538` moved the new assets to fresh URLs, and the live site has been verified since. Lesson: wait for the HTML to reference the new URLs before requesting assets.

## Still open
- **Color contrast (your decision):** the brand pink #F53F7B fails WCAG contrast with white text (3.57:1, against 4.5:1 needed) and as text on the cream background (3.42:1). It's used on about 25 buttons and about 160 text elements. The smallest fix is a darker pink such as #C8285D for buttons and links (5.4:1 on white).
- **Fonts:** if you want DM Sans and Playfair Display (the intended design), I can self-host them properly. This would visibly change the typography.
- **robots.txt:** Lighthouse flags the `Content-Signal` line. It comes from Cloudflare's managed robots.txt and is harmless to Google.
- **Manual steps, need Google sign-in:** run the Rich Results Test and submit the sitemap in Search Console.
