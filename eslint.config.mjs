// Enforce hook order for React and preact/hooks; types cannot detect conditional-hook failures.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", ".wrangler", "firstmotion", "test-results", "playwright-report"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: "readonly", document: "readonly", navigator: "readonly", console: "readonly" },
    },
    rules: {
      // The whole point of this file.
      "react-hooks/rules-of-hooks": "error",
      /*
       * Warn only. Exhaustive deps is a real judgement call often enough that erroring on it trains you
       * to disable the line, and a disable comment takes rules-of-hooks down with it.
       */
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      /*
       * A missing entry in the sprite, palette and slab tables is a programming error the tests already
       * catch, not a runtime condition to handle. The house style asserts and moves on.
       */
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    /* Asset generators, run by hand on node rather than shipped to a browser. */
    files: ["tools/**/*.mjs", "*.config.{ts,mjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        /* `make-card` reads the app's palette inside a `page.evaluate`, which really is a browser. */
        document: "readonly",
        getComputedStyle: "readonly",
      },
    },
  },
);
