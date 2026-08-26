import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  base: process.env.VITE_BASE || "/",
  optimizeDeps: {
    exclude: ["box3d.js", "box3d.js/inline"],
  },
  server: { host: true, port: 5173 },
});
