import { defineConfig } from "vite";

export default defineConfig({
  root: "browser",
  server: {
    port: 5173,
    strictPort: true,
  },
});
