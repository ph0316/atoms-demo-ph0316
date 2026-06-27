import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111318",
        panel: "#f7f7f4",
        line: "#deded8",
        cobalt: "#334bfa",
        mint: "#0f8f72",
        ember: "#d9542b",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(18, 22, 30, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
