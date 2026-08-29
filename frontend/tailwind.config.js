/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        accent: '#6659ff',
        'accent-hover': '#7a6eff',
        'accent-pressed': '#5a4de6',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'apple-in': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backdropBlur: {
        material: '20px',
        'material-thick': '32px',
      },
      keyframes: {
        'material-in': {
          '0%': { opacity: '0', backdropFilter: 'blur(0px)', transform: 'scale(0.98)' },
          '100%': { opacity: '1', backdropFilter: 'blur(20px)', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'material-in': 'material-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
