import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'RestaurantOS POS',
        short_name: 'RestaurantOS',
        description: 'Lightning-fast restaurant POS system',
        theme_color: '#007AFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'landscape-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: []
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
               return 'react-vendor';
            }
            if (id.includes('firebase')) {
               return 'firebase-vendor';
            }
            if (id.includes('lucide-react')) {
               return 'ui-vendor';
            }
            if (id.includes('i18next')) {
               return 'i18n-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  resolve: { alias: { '@': '/src' } }
})
