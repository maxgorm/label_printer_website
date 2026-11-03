// Pages that kept Tailwind's default border radius: 404, download, support, faq.
const theme = require('./theme.cjs');
module.exports = {
  darkMode: 'class',
  content: [
    './public/{404,download,support,faq}.html',
    './public/assets/js/**/*.js',
  ],
  theme: { extend: theme },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
