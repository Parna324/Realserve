import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#232833",
        surface: {
          50: "#F8FAFC",
          100: "#E5E7EB",
          300: "#9CA3AF",
          500: "#6B7280",
          700: "#242935",
          800: "#171B24",
          900: "#0E1117",
          950: "#080A0F"
        },
        accent: {
          400: "#7DD3FC",
          500: "#38BDF8",
          600: "#0284C7"
        }
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"]
      },
      boxShadow: {
        live: "0 0 0 1px rgba(56, 189, 248, 0.22), 0 20px 80px rgba(56, 189, 248, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
