/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './**/*.{ts,tsx,js,jsx,html}',
    './components/**/*.{ts,tsx,js,jsx,html}',
    './contexts/**/*.{ts,tsx}',
    './router/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}


