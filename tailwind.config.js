/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Varm kaffepalet – 500 er hovedfarven
        kaffe: {
          50: '#faf6f1',
          100: '#f1e8dc',
          200: '#e2cfb6',
          300: '#cfae88',
          400: '#b98a5c',
          500: '#9c6b3f',
          600: '#7f5232',
          700: '#63402a',
          800: '#4a3122',
          900: '#33221a',
        },
      },
    },
  },
  plugins: [],
}
