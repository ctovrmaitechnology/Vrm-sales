/** @type {import('tailwindcss').Config} */
export default {
  important: '#email-module',
  content: [
    "./src/old-email-components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  }
}
