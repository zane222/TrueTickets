import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "build", "node_modules"]),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: globals.browser,
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    settings: {
      react: {
        version: "detect", // ensures React 19 semantics are used
      },
    },

    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,

      // React hooks (React 19 aware)
      ...reactHooks.configs["recommended-latest"].rules,
      // OR use this if you want fewer warnings in React 19:
      // ...reactHooks.configs.recommended.rules,

      // React Refresh for Vite
      ...reactRefresh.configs.vite.rules,

      // Custom overrides
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" },
      ],
    },
  },
]);
