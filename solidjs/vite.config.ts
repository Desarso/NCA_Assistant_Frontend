import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    solidPlugin(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // includeAssets: ['favicon.ico', 'offline.html', 'pwa-192x192.png', 'pwa-512x512.png', 'icons/apple-touch-icon.png', 'icons/mask-icon.svg'],
      // manifest: false, // Use the manifest.json file in public directory
      // strategies: 'generateSW',
      workbox: {
        // globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // navigateFallback: null,
        // navigateFallbackDenylist: [/^\/(api|admin)/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // Cache pages for 1 day
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 20,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
            },
          },
        ]
      }
    })
  ],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "debug": path.resolve(__dirname, "node_modules/debug/src/browser.js"),
      "extend": path.resolve(__dirname, "node_modules/extend/index.js")
    }
  },
  optimizeDeps: {
    include: ['debug', 'extend'],
    esbuildOptions: {
      target: 'esnext',
      format: 'esm',
      mainFields: ['module', 'jsnext:main', 'jsnext']
    }
  },
  preview: {
    host: process.env.VITE_CHAT_HOST_DEV,
    allowedHosts: ['nca-assistant.gabrielmalek.com', 'nca-assistant.development.gabrielmalek.com']
  }
});
