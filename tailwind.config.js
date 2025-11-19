// File: tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
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
