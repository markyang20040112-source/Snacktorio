/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        factory: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          accent: '#f59e0b',
          energy: '#38bdf8',
          fluid: '#06b6d4',
          void: '#a855f7'
        }
      }
    },
  },
  plugins: [],
}
