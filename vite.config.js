const { defineConfig } = require("vite");
const path = require("node:path");
const vue = require("@vitejs/plugin-vue").default;
const tailwindcss = require("@tailwindcss/vite").default;

module.exports = defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/vue")) {
            return "vue-vendor";
          }

          if (
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/class-variance-authority")
          ) {
            return "ui-vendor";
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
