import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiOrigin = env.CMI_DEV_API_ORIGIN || "http://127.0.0.1:8787";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: false,
          secure: false,
        },
      },
    },
  };
});
