import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-refreshes the service worker when you ship a new build,
      // so users don't get stuck on a stale cached version.
      registerType: 'autoUpdate',

      // devOptions disabled in production/web mode (not needed for Vercel)
      devOptions: {
        enabled: false,
      },

      // Static files in /public that should be precached alongside
      // the manifest icons below.
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],

      manifest: {
        name: 'Lavanya Aari Materials – OMS',
        short_name: 'Lavanya OMS',
        description: 'Lavanya Aari Materials – Order Management System',
        theme_color: '#7c3aed',       // matches --accent in styles.css
        background_color: '#f5f3ff',  // matches --bg in styles.css (splash screen)
        display: 'standalone',        // hides browser UI -> looks like a native app
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache the built app shell so it can launch offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  // CHANGED: '/' instead of './' — relative paths break asset loading on Vercel
  base: '/',
  server: { port: 5173 },
  build: { outDir: 'dist' },
  optimizeDeps: {
    include: ['pdfjs-dist', 'xlsx']
  }
});
