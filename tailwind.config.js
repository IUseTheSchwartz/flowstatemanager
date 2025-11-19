// File: tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // You can tweak brand colors here later if you want more Flow State flavor
      colors: {
        flow: {
          bg: "#05060a",
          panel: "#0b0b0c",
          blue: "#38bdf8",
        },
      },
    },
  },
  plugins: [],
};
