/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8fc7ff",
          400: "#5fa9ff",
          500: "#347cff",
          600: "#2259ff",
          700: "#1d45d8",
          800: "#1e3cae",
          900: "#20398a",
        },
        accent: "#7c3aed",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 18px 60px rgba(12, 20, 40, 0.45)",
      },
    },
  },
  plugins: [],
};
