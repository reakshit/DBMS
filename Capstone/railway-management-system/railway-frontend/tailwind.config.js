/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chalk: '#EDEFF2',
        ink: '#101C33',
        coach: '#1E4B8F',
        board: '#F4B400',
        rule: '#CBD1DB',
        go: '#1F7A4D',
        stop: '#B83227',
        wait: '#B26A00',
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'Impact', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible Next"', '"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
