import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f5f2eb",
        ink: "#0f1418",
        ember: "#f76b2a",
        copper: "#b74a1f",
        ocean: "#1f3644",
      },
      boxShadow: {
        sticker: "0 36px 80px rgba(4, 10, 14, 0.35)",
      },
      backgroundImage: {
        "grain-grid":
          "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;

