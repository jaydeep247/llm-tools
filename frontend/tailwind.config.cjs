/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx,html}',
    './components/**/*.{ts,tsx,js,jsx,html}',
    './contexts/**/*.{ts,tsx}',
    './router/**/*.{ts,tsx}',
    './*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}


