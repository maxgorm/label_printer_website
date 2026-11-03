# Action Plan: sentimonotes.com

## Phase 1 - Week 1 (Critical)
1. Generate `public/sitemap.xml` (index, faq, support, download, policies; exclude 404/order-confirmed/auth-action) and add `Sitemap:` to robots (note robots is Cloudflare-managed; add via Cloudflare or a `public/robots.txt`). Success check: Search Console shows sitemap "Success".
2. Choose canonical host (recommend `www`, since apex already redirects there), fix `og:url`, make http->https->host one hop, add `<link rel="canonical">` to every indexable page. Check: `curl -I` shows single 301/308; GSC "Duplicate without canonical" stays 0.
3. Add JSON-LD: `Organization` + `WebSite` on all pages; `Product` with `Offer` (price, currency, availability, shipping) on the homepage order section. Check: Rich Results Test passes, Merchant Center eligible.

## Phase 2 - Weeks 2-3 (High)
4. Fix OG/Twitter images: absolute URL, 1200x630, < 300 KB. Check: Facebook Sharing Debugger.
5. Compress images to WebP/AVIF with srcset; shrink `SentimoProductVid.mp4` to < 5 MB with poster and `preload="none"`; add width/height + lazy loading. Check: PageSpeed mobile LCP < 2.5 s.
6. Replace Tailwind CDN with a built CSS file (Tailwind CLI). Check: no `cdn.tailwindcss.com` request, lower INP/LCP.
7. Decide AI-crawler policy; allow search/retrieval bots if you want AI-answer visibility.

## Phase 3 - Month 2 (Content & authority)
8. Rewrite homepage title/description with category terms (e.g. "Sentimo: Paired Thermal Note Printers for Couples & Long-Distance Gifts").
9. Rename `preorder-policy` -> `order-policy` with 301.
10. Add landing/content pages: long-distance gifts, anniversary gifts, how it works, customer stories/reviews (with Review schema only for genuine reviews).
11. Add CSP, Referrer-Policy, Permissions-Policy headers in `vercel.json`; `noindex` on `auth-action.html`.

## Phase 4 - Ongoing
Monitor GSC coverage/CTR, CrUX CWV, branded search ("Sentimo notes"); re-run `/seo drift baseline https://www.sentimonotes.com` after Phase 2 and compare.
