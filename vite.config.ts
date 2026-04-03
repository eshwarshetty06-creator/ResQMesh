import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(() => ({
  // Web hosting (Render/Vercel) needs '/' for correct asset/SW paths.
  // Capacitor WebView needs './' for relative paths inside the APK.
  // Set CAPACITOR=true when building for mobile (see mobile:build script).
  base: process.env.CAPACITOR === 'true' ? './' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000, // suppress large-bundle warning (leaflet + peerjs)
  },
  server: {
    host: true,
    port: 5173,
    hmr: false, // Disable HMR WebSocket (avoids conflict with /peerjs WS proxy). Use Ctrl+R to refresh.
    proxy: {
      '/peerjs': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  define: {
    // Local dev → localhost:9000
    // Production → set VITE_PEER_HOST, VITE_PEER_PORT, VITE_PEER_PATH in your
    //              Vercel / Render environment variables
    __PEER_HOST__: JSON.stringify(process.env.VITE_PEER_HOST || ''),
    __PEER_PORT__: JSON.stringify(parseInt(process.env.VITE_PEER_PORT || '9000', 10)),
    __PEER_PATH__: JSON.stringify(process.env.VITE_PEER_PATH || '/peerjs'),
  },
}));
