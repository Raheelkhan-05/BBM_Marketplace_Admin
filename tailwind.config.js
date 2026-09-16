/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      fontFamily: {
        sans: ["'Geist Sans', sans-serif"],
        mono: ["'Geist Mono', monospace"],
      },
    },
  },
  plugins: [],
};