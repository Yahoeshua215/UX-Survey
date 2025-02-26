import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      keyframes: {
        tooltipFade: {
          "0%": {
            opacity: "0",
            transform: "translate(-50%, -10px)"
          },
          "100%": {
            opacity: "1",
            transform: "translate(-50%, 0)"
          }
        }
      },
      animation: {
        tooltipFade: "tooltipFade 0.2s ease-in-out"
      }
    },
  },
  plugins: [],
};
export default config;
