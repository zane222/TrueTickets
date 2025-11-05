import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker"; // ✅ add type + lint checking
import packageJson from "./package.json";

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react({
      // ✅ Enables React Fast Refresh and proper JSX transform
      jsxImportSource: "react",
    }),

    // ✅ Adds TypeScript checks in dev + build
    // Temporarily disabled ESLint checks due to version compatibility issues
    checker({
      typescript: true,
    }),
  ],

  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false, // change to true for debugging production issues

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          ui: ["framer-motion", "lucide-react"],
          pdf: ["html2pdf.js", "html2canvas", "jspdf"],
          aws: ["aws-amplify", "@aws-sdk/client-cognito-identity-provider"],
        },
      },
    },

    chunkSizeWarningLimit: 1000, // reasonable for large deps
  },

  server: {
    port: 3000,
    open: true,
    strictPort: true, // ✅ avoids silent port switching
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "framer-motion",
      "lucide-react",
      "aws-amplify",
    ],
  },
});
