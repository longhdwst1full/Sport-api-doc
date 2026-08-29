import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { admin: { 500: '#16a56a', 950: '#10251c' } } } },
  plugins: [],
} satisfies Config;
