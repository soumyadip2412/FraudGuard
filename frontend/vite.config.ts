import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (uvicorn on :8000). Proxying /api through
// Vite keeps the browser on one origin, so no CORS setup is needed; nginx does the
// same job in the Docker build.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
