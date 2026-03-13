import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#11131A",
        sand: "#F6EFE4",
        ember: "#D95D39",
        moss: "#3B5B4A",
        steel: "#5F6C82",
      },
      fontFamily: {
        sans: ["Space Grotesk", "ui-sans-serif", "sans-serif"],
        serif: ["IBM Plex Serif", "ui-serif", "serif"],
      },
      boxShadow: {
        panel: "0 20px 60px rgba(17, 19, 26, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;