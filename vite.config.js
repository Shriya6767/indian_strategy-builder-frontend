import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fileLogPlugin from './vite-plugins/fileLogPlugin';

// https://vite.dev/config/
export default defineConfig({
  // Frontend logs -> VS Code terminal + src/logs/frontend-*.log. Mounted on
  // the preview server too: live testing runs on `vite preview` (4173).
  plugins: [react(), tailwindcss(), fileLogPlugin()],
  build: {
    // Pinned to the app's true support floor instead of Vite's default (which
    // rises with each Vite release). The floor is set by CSS, not JS: Tailwind 4
    // wraps everything in @layer, which needs Chrome/Edge 99, Firefox 97,
    // Safari 15.4 — no build setting can go below that. Pinning the JS target
    // to the same line guarantees the emitted syntax never exceeds what those
    // browsers parse, today or after a future Vite upgrade.
    // (Win7/8.1 machines cap at Chrome 109, comfortably above this floor.)
    target: ['chrome99', 'edge99', 'firefox97', 'safari15.4'],
  },
  // `vite preview` serves the COMPILED dist/ — the same artifact old browsers
  // get in production — unlike the dev server, which ships untranspiled
  // modules only modern Chrome can parse. host:true exposes it on the LAN for
  // the lab PCs.
  preview: {
    port: 4173,
    host: true,
    // Vite refuses requests whose Host header it does not recognise, which is
    // every ngrok tunnel. Without these the page never loads at all.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    proxy: {
      '/api': {
        target: 'http://192.168.1.5:8000',
        changeOrigin: true,
      },
      // The live WebSocket. Proxied for the same reason /api is: the page may
      // be served over https (ngrok), and a browser refuses to open an
      // insecure ws:// socket from an https page. Going through the origin
      // lets the client use wss:// and inherit the page's TLS.
      '/ws': {
        target: 'http://192.168.1.5:8001',
        ws: true,
        // NO changeOrigin here, unlike /api above. It rewrites the Host header
        // to the target, while the browser still sends its own Origin -- and a
        // curl upgrade with no Origin at all returns 101 from this same worker,
        // so the mismatch is what the handshake was failing on.
      },
    },
  },
  server: {
    port: 5174,
    host: true,
    // Same reason as `preview` above. The dev server had neither, so pointing
    // a tunnel at 5174 instead of 4173 was refused outright.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    proxy: {
      '/api': {
        target: 'http://192.168.1.5:8000',
        changeOrigin: true,
      },
      // The live WebSocket. Proxied for the same reason /api is: the page may
      // be served over https (ngrok), and a browser refuses to open an
      // insecure ws:// socket from an https page. Going through the origin
      // lets the client use wss:// and inherit the page's TLS.
      '/ws': {
        target: 'http://192.168.1.5:8001',
        ws: true,
        // NO changeOrigin here, unlike /api above. It rewrites the Host header
        // to the target, while the browser still sends its own Origin -- and a
        // curl upgrade with no Origin at all returns 101 from this same worker,
        // so the mismatch is what the handshake was failing on.
      },
    },
  },
})
