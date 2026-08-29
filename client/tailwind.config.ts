import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211b',
        cream: '#f6f3ea',
        brand: { 50: '#effbf4', 500: '#19a15f', 600: '#12824b', 900: '#16432d' },
      },
      boxShadow: { card: '0 18px 50px rgba(23, 33, 27, 0.10)' },
    },
  },
  plugins: [],
} satisfies Config;
