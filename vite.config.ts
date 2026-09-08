import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Electron loads the production build from file://, so packaged assets must
  // resolve relative to dist/index.html rather than from the drive root.
  base: "./",
  plugins: [react(), {
    name: "development-csp",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'none';", "connect-src 'self' ws://127.0.0.1:1420;");
    },
  }],
  clearScreen: false,
  server: {
    strictPort: true,
    host: "127.0.0.1",
  },
  // No configuration or credentials are automatically copied into renderer JS.
  envPrefix: [],
});
