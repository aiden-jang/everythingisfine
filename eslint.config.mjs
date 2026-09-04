/*
 * One rule matters here, and the rest is there to keep it honest.
 *
 * owewell shipped a `useEffect` below a component's early returns. The first render bailed out before
 * reaching it and the next render ran one hook more, which is React error #310, and it took out every
 * group page the instant its data arrived. Typecheck, build and the whole suite stayed green. Nothing
 * but a static rule sees that.
 *
 * This app is Preact, and `preact/hooks` has the same contract and the same failure. `App.tsx` alone
 * holds dozens of hooks across dozens of effects, which is where that bug lives.
 */
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
