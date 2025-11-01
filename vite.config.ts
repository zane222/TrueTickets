import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker"; // ✅ add type + lint checking

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // ✅ Enables React Fast Refresh and proper JSX transform
      jsxImportSource: "react",
    }),

    // ✅ Adds TypeScript and ESLint checks in dev + build
    // NOTE: To use ESLint integrated here you MUST upgrade the checker + eslint packages
    // locally. Run:
    //   npm install -D vite-plugin-checker@latest eslint@latest @typescript-eslint/parser @typescript-eslint/eslint-plugin
    // This file assumes the checker plugin version is compatible with ESLint v9+.
    // The `lintCommand` below is intentionally explicit about extensions to avoid ambiguous CLI parsing.
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint --ext .ts,.tsx,.js,.jsx src",
      },
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
