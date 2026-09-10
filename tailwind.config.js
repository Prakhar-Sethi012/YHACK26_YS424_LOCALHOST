/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tactical: {
          bg: "#0a0e14",
          panel: "#111823",
          border: "#1f2b3a",
          cyan: "#00e5ff",
          amber: "#ffb020",
          red: "#ff3b3b",
          green: "#2bd576",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
