import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'pdfaster',
        short_name: 'pdfaster',
        description: 'Your PDF never leaves your browser. Edit, annotate, merge, split, convert — all in this tab.',
        theme_color: '#48CFCB',
        background_color: '#F5F5F5',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          // ponytail: ship a single 512x512 maskable icon as a static SVG.
          // The browser scales it for any context. Skip the 192/256/384/512
          // multi-size matrix; vite-plugin-pwa handles the rest.
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // ponytail: cache the JS/CSS bundles + the static fonts. Do
        // NOT cache pdf.js worker with the Workbox precache (it
        // would be stale on update); let pdf.js's own ?url import
        // handle it via the browser's HTTP cache.
        globPatterns: ['**/*.{js,css,woff,woff2,svg,png}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
