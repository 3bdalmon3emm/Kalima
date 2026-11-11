/* eslint-disable no-undef */
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const normalizeProxyTarget = (value) => {
  const target = String(value || "")
  if (!/^https?:\/\//.test(target)) return "http://localhost:5001"
  return target.replace(/\/api\/v\d+\/?$/, "").replace(/\/$/, "")
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "serve" && process.env.NODE_ENV !== "development") {
    process.env.NODE_ENV = "development"
  }

  const env = loadEnv(mode, process.cwd(), "")
  const apiProxyTarget = normalizeProxyTarget(env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        // Files kept on the backend's local disk (no R2) in development.
        '/uploads': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
      cors: true,
    },
    define: mode === 'production'
      ? { 'import.meta.env.VITE_API_URL': JSON.stringify('https://kalima-edu.com/api/v2') }
      : undefined,
    build: {
      chunkSizeWarningLimit: 1600,
      cssMinify: true,
      cssCodeSplit: true,
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter((dep) => !dep.includes('embedpdf-'));
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('/firebase/') || id.includes('/@firebase/')) {
              return 'firebase-bundle';
            }
            if (id.includes('/pdfjs-dist/')) {
              return 'pdfjs';
            }
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router-dom/')
            ) {
              return 'react-vendor';
            }
            if (id.includes('/@radix-ui/')) {
              return 'radix-ui';
            }
            if (id.includes('/framer-motion/') || id.includes('/lucide-react/') || id.includes('/lenis/')) {
              return 'ui-libs';
            }
            if (id.includes('/libphonenumber-js/') || id.includes('/country-data-list/') || id.includes('/lodash/') || id.includes('/date-fns/')) {
              return 'utility-libs';
            }
          }
        }
      }
    },
  }
})
