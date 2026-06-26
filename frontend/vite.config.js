import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {

    host: '0.0.0.0',

    allowedHosts: [
      'sloppy-pentagram-backwater.ngrok-free.dev'
    ],

    proxy: {
      '/facebook-api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/facebook-api/, ''),
      },
      '/linkedin-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/linkedin-api/, ''),
      },
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
      },
    },
  },
})
