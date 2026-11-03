# SEO fixes: production verification

Checked 2026-11-03 against live https://www.sentimonotes.com. Commit `7f18e64` merged to `main`; Vercel Production deployment reports that SHA.

| Fix | Result |
|---|---|
| sitemap.xml | 200, `application/xml`, lists 7 URLs (was the 404 page) |
| robots.txt Sitemap line | `Sitemap: https://www.sentimonotes.com/sitemap.xml` |
| Canonical tags | present on all 7 indexable pages (see below) |
| og:url / og:image | absolute `www` URLs |
| JSON-LD | valid JSON; Organization, WebSite, Product with 2 InStock offers |
| auth-action.html | `noindex` present |

## sitemap.xml (live)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.sentimonotes.com/</loc></url>
  <url><loc>https://www.sentimonotes.com/faq.html</loc></url>
  <url><loc>https://www.sentimonotes.com/support</loc></url>
  <url><loc>https://www.sentimonotes.com/download</loc></url>
  <url><loc>https://www.sentimonotes.com/privacy.html</loc></url>
  <url><loc>https://www.sentimonotes.com/terms.html</loc></url>
  <url><loc>https://www.sentimonotes.com/preorder-policy.html</loc></url>
</urlset>
```

## Canonicals (live)
```
/ -> "https://www.sentimonotes.com/"
/faq.html -> "https://www.sentimonotes.com/faq.html"
/support -> "https://www.sentimonotes.com/support"
/download -> "https://www.sentimonotes.com/download"
/privacy.html -> "https://www.sentimonotes.com/privacy.html"
/terms.html -> "https://www.sentimonotes.com/terms.html"
/preorder-policy.html -> "https://www.sentimonotes.com/preorder-policy.html"
```

## Open Graph (homepage, live)
```
property="og:url" content="https://www.sentimonotes.com/"
property="og:image" content="https://www.sentimonotes.com/assets/IMG_4321.JPG"
```

## JSON-LD offers (parsed from live homepage)
```
types: ['Organization', 'WebSite', 'Product']
1 Sentimo printer 29.99 USD https://schema.org/InStock
2 Sentimo printers 49.99 USD https://schema.org/InStock
```

## Not verified / still open
- Google Rich Results Test not run (needs interactive Google UI). Run it on https://www.sentimonotes.com/ to confirm Product eligibility.
- Submit the sitemap in Search Console.
- Bare domain redirects to www with a 307 (temporary); set it to permanent in Vercel domain settings.
- og:image is still the 8 MB IMG_4321.JPG; resize to ~1200x630 and under 300 KB.
