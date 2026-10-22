import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cyberpunk neon palette at the top level so that `bg-neonBlue`,
        // `text-neonGreen`, `border-neonOrange`, … work directly.
        neonBlue: "#00d4ff",
        neonGreen: "#00ff88",
        neonOrange: "#ff6b35",
        neonPink: "#ff2e88",
        neonPurple: "#9d4edd",
        dark: "#11111a",
        darker: "#0a0a0f",
      },
      fontFamily: {
        display: ["'Rajdhani'", "'Orbitron'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        "neon-blue": "0 0 20px rgba(0, 212, 255, 0.35)",
        "neon-green": "0 0 20px rgba(0, 255, 136, 0.35)",
        "neon-orange": "0 0 20px rgba(255, 107, 53, 0.35)",
        "neon-pink": "0 0 20px rgba(255, 46, 136, 0.35)",
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translate(-50%, 12px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0) scale(1)" },
        },
        "pulse-neon": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "toast-in": "toast-in 0.25s ease-out",
        "pulse-neon": "pulse-neon 2s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};
