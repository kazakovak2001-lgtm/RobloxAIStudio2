import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const compatibilityRule = {
  meta: { schema: [] },
  create: () => ({}),
};

const backendFiles = ["server/src/**/*.ts"];
const executionBoundaryFiles = [
  "server/src/routes/**/*.ts",
  "server/src/projects/services/**/*.ts",
  "server/src/planning/**/*.ts",
  "server/src/generation/**/*.ts",
  "server/src/simulation/**/*.ts",
  "server/src/economy/**/*.ts",
  "server/src/world/**/*.ts",
  "server/src/lifecycle/**/*.ts",
  "server/src/artifacts/**/*.ts",
  "server/src/export/**/*.ts",
  "server/src/compiler/**/*.ts",
];

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      // The legacy config never enabled React Hooks linting, but two existing
      // source comments reference this rule. Defining it preserves that
      // behavior while allowing ESLint 10 to parse those directives.
      "react-hooks": {
        rules: { "exhaustive-deps": compatibilityRule },
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/src/**"],
              message:
                "Forbidden: no imports from app/src/ — use server/src/ for backend.",
            },
            {
              group: ["**/lib/src/**"],
              message: "Forbidden: no imports from lib/src/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: backendFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../src/**", "../../../src/**"],
              message:
                "Backend (server/src/) must not import from frontend (src/) directly. Use API calls.",
            },
          ],
        },
      ],
    },
  },
  {
    files: executionBoundaryFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/execution/aiPipelineIntegrator*"],
              message:
                "FORBIDDEN: aiPipelineIntegrator is deprecated. Use PlanExecutor as the only runtime execution engine.",
            },
            {
              group: ["../../src/**", "../../../src/**"],
              message: "Backend must not import from frontend.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../server/src/**", "../../../server/src/**"],
              message:
                "Frontend (src/) must not import from backend (server/src/) directly. Use API calls.",
            },
          ],
        },
      ],
    },
  },
];
