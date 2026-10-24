import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // "/assets" is the server's generated images; built JS and CSS go under "/static".
  build: { assetsDir: "static" },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/assets": "http://localhost:3001",
    },
  },
});
