/** @type {import('tailwindcss').Config} */
export default {
  // Utilities are scoped so they never leak into the rest of the app:
  // they only apply inside the email dashboard (#email-module) and the Calls page (.calls-page).
  important: ':is(#email-module, .calls-page)',
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./src/old-email-components/**/*.{js,jsx}",
    "./src/pages/Calls.jsx",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  }
}

