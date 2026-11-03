// Theme shared by both stylesheets. This replaces the inline `tailwind.config`
// blocks the pages used with the Tailwind CDN.
module.exports = {
  colors: {
    primary: "#F53F7B",
    "primary-hover": "#D92E66",
    "accent-pink": "#FFE8F0",
    "background-light": "#FFF9F5",
    "background-dark": "#18181B",
    "surface-light": "#FFFFFF",
    "surface-dark": "#27272A",
    "text-main-light": "#1F2937",
    "text-main-dark": "#F3F4F6",
    "text-muted-light": "#6B7280",
    "text-muted-dark": "#9CA3AF",
  },
  fontFamily: {
    sans: ["DM Sans", "sans-serif"],
    serif: ["Playfair Display", "serif"],
  },
  boxShadow: {
    soft: "0 20px 40px -15px rgba(245, 63, 123, 0.15)",
    card: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
  },
};
