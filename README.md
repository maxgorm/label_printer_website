# Sentimo Website

Print love notes, instantly. 💌

## Development

```bash
# Install dependencies (optional, for local dev server)
npm install

# Run local dev server
npx serve public
```

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
