/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#ec4899',
          purple: '#9333ea'
        }
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #f472b6, #a855f7 50%, #4f46e5)',
        'sidebar-gradient': 'linear-gradient(160deg, #db2777, #7c3aed 55%, #4338ca)'
      }
    }
  },
  plugins: []
};
