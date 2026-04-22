/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#EDE8E0",
        frame: "#F5F5F3",
        border: "#D9D3CA",
        accent: "#C4551A",
        "accent-glow": "#D4682A",
        muted: "#6B6560",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
