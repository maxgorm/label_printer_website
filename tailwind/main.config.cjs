// Pages that used larger rounded corners: index, order-confirmed, order-policy, privacy, terms, reviews,
// plus the gift guides.
const theme = require('./theme.cjs');
module.exports = {
  darkMode: 'class',
  content: [
    './public/{index,memory-book,order-confirmed,order-policy,privacy,terms,reviews}.html',
    './public/gifts/*.html',
    './public/assets/js/**/*.js',
  ],
  theme: {
    extend: {
      ...theme,
      borderRadius: { DEFAULT: '1rem', xl: '1.5rem', '2xl': '2rem' },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
