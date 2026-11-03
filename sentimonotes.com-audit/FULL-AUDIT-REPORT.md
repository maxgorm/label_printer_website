# SEO Audit: sentimonotes.com (2026-11-02)

**Business type:** E-commerce (single-product DTC hardware: paired thermal note printers + paper add-on, US + 17 intl countries)
**SEO Health Score: ~52/100** (estimate; no field data, lab performance not measured)
**Scope:** live homepage/robots/sitemap/headers + the 10 static pages in `public/`. Not run: Google/Matomo/DataForSEO/backlink APIs (no credentials), Lighthouse.

| Category | Weight | Score |
|---|---|---|
| Technical SEO | 22% | 62 |
| Content Quality | 23% | 65 |
| On-Page SEO | 20% | 55 |
| Schema | 10% | 10 |
| Performance | 10% | 50 (inferred from asset weight) |
| AI Search Readiness | 10% | 40 |
| Images | 5% | 40 |

## Critical
1. **No sitemap.xml** - `/sitemap.xml` returns the 404 page. No `Sitemap:` line in robots.txt. 
2. **No canonical tags on any page**, and the host is split: `sentimonotes.com` 307-redirects to `www.sentimonotes.com`, but `og:url` points to the apex and `http://` 308s to the apex first (http -> apex -> www chain). Pick one host, make redirects a single permanent 301/308, and set `<link rel="canonical">` on every indexable page.
3. **No structured data anywhere.** No Product/Offer, Organization, WebSite or FAQPage JSON-LD. For a store this forfeits Product rich results (price, availability, shipping) and merchant listing eligibility.

## High
4. **Social/OG images are unusable:** `og:image` and `twitter:image` are relative (`/assets/IMG_4321.JPG`); crawlers need absolute URLs. The file is also 8.1 MB (most scrapers cap around 5-8 MB). Use a ~1200x630 JPG/WebP under 300 KB.
5. **Huge unoptimized assets:** `SentimoProductVid.mp4` 62 MB, three JPGs 6-8 MB, nine PNGs 0.8-1.9 MB. Likely hurting LCP/mobile CWV. Convert to WebP/AVIF, resize, add `srcset`, and stream/compress the video (target < 5 MB, `preload="none"`, poster).
6. **Tailwind via CDN (`cdn.tailwindcss.com`)** runs a JIT compiler in the browser: render-blocking script, FOUC risk, and the vendor says not for production. Build a static CSS file.
7. **Robots.txt blocks AI crawlers** (Cloudflare-managed: GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended, meta-externalagent, etc.) with `ai-train=no`. Googlebot is allowed, so classic SEO is fine, but this likely cuts visibility in some AI answer engines. Decide intentionally; training-only bots can stay blocked while search/retrieval bots (OAI-SearchBot, PerplexityBot, Claude-SearchBot) are allowed.
8. **Thin, generic content for a single-page store:** one indexable money page, no category/use-case content (long-distance couples, gifts, anniversary). No blog, reviews, or product detail beyond the homepage.

## Medium
9. Title/description: homepage title is a slogan with no category keyword ("thermal printer", "love notes", "long distance gift"). Meta description ends "Order now."; keywords meta is ignored. `faq.html` title/description are generic ("FAQ - Sentimo").
10. `preorder-policy.html` URL still says pre-order though the site moved to normal orders (commit b58d8c5). Rename to `/order-policy` and 301 the old URL; also update internal links.
11. Missing security headers: only HSTS, nosniff, X-Frame-Options present. No CSP, Referrer-Policy, Permissions-Policy.
12. Only 9 of 26 homepage `<img>` have lazy loading; most `<img>` lack width/height (CLS risk).
13. `Cache-Control: max-age=0, must-revalidate` on HTML (fine) but confirm static assets get long immutable caching; CSS uses `?v=` query busting.
14. `faq.html` and `support.html` overlap; consider consolidating or cross-linking.
15. No `llms.txt` (optional; Google ignores it).

## Low / Info
- Utility pages correctly `noindex` (`404`, `order-confirmed`); `auth-action.html` has no noindex - add one.
- Heading structure on homepage is clean (single H1, logical H2/H3).
- Alt text present on all homepage images.
- HTTPS + HSTS in place, `lang="en"`, viewport meta, favicon present.
- GA4 (`G-XF7KSGXZVW`) installed; verify Google Search Console is verified and a sitemap submitted once it exists.
- Redirect IG/FB `utm_source` visits to `#reserve` via JS: fine for users, no SEO impact (hash only).
- Reminder: FAQPage rich results were retired May 2026, so don't add FAQ schema for SERP benefit.

## What works
HTTPS/HSTS, single clear H1, unique titles and descriptions on all pages, noindex on transactional pages, Googlebot allowed, alt text complete, clear product copy and order section.
