import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        figma: {
          purple: "#A259FF",
          green: "#0ACF83",
          red: "#F24E1E",
          orange: "#FF7262",
          blue: "#1ABCFE",
        },
      },
    },
  },
  plugins: [],
};

export default config;
