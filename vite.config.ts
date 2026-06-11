import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "valentin-local-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/")) {
            next();
            return;
          }

          const { handleApiRequest } = await import("./server/notes-core.mjs");
          await handleApiRequest(req, res);
        });
      }
    }
  ],
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
