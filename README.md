# Sentimo Website

Print love notes, instantly. 💌

## Development

```bash
npm install

# Run the site and the /api endpoints locally
npm run dev
```

Checkout needs a Stripe **test** key in `.env.local` (git-ignored), for example
`STRIPE_SECRET_KEY=sk_test_...`. The dev server refuses to start with a live key.

Then open [http://localhost:3000](http://localhost:3000)

## Deployment

This project is configured for **Vercel**. Simply connect your GitHub repo or run:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Vercel will automatically detect the static site configuration from `vercel.json` and serve from the `public/` directory.

## Project Structure

```
├── public/                  # Static site root (served by Vercel)
│   ├── index.html           # Main landing page
│   └── assets/
│       ├── css/
│       │   └── styles.css   # Custom styles
│       ├── js/
│       │   └── main.js      # Interactivity (dark mode, scroll, etc.)
│       └── favicon.svg      # Site favicon
├── package.json
├── vercel.json              # Vercel deployment config
└── README.md
```

## Tech Stack

- **HTML5** with semantic markup
- **Tailwind CSS** (via CDN)
- **Vanilla JavaScript** (no frameworks)
- **Google Fonts** (DM Sans, Playfair Display)
- **Material Icons**
- **Vercel** for hosting


Email list in resend.com