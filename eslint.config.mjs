import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import configPrettier from "eslint-config-prettier";
import pluginImport from "eslint-plugin-import";
import pluginPrettier from "eslint-plugin-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReactNative from "eslint-plugin-react-native";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [
  // Base JavaScript configuration
  js.configs.recommended,

  // Global settings for all files
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        __DEV__: "readonly",
        NodeJS: "readonly",
        React: "readonly",
      },
      ecmaVersion: 2021,
      sourceType: "module",
    },
    plugins: {
      import: pluginImport,
      "unused-imports": pluginUnusedImports,
      prettier: pluginPrettier,
    },
    rules: {
      // Import rules
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/no-unresolved": "off", // React Native has special resolution
      "import/no-duplicates": "error",

      // Unused imports
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // Prettier integration
      "prettier/prettier": "error",
    },
  },

  // TypeScript configuration
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,

      // TypeScript specific rules (more lenient for existing codebase)
      "@typescript-eslint/no-unused-vars": "off", // Handled by unused-imports
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-var-requires": "error",

      // Disable strict type checking rules for existing codebase
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-implied-eval": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",

      // Additional rules for better code quality
      "no-useless-catch": "error",
      "no-undef": "error",
    },
  },

  // React configuration
  {
    files: ["**/*.{jsx,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "react-native": pluginReactNative,
    },
    rules: {
      ...pluginReact.configs.recommended.rules,
      ...pluginReact.configs["jsx-runtime"].rules,
      ...pluginReactNative.configs.all.rules,
      ...pluginReactHooks.configs.recommended.rules,

      // React specific rules
      "react/react-in-jsx-scope": "off", // Not needed with React 17+
      "react/prop-types": "off", // Using TypeScript
      "react/display-name": "off",
      "react/no-unescaped-entities": "warn",

      // React Native specific rules
      "react-native/no-unused-styles": "error",
      "react-native/split-platform-components": "error",
      "react-native/no-inline-styles": "warn",
      "react-native/no-color-literals": "warn",
      "react-native/no-raw-text": "off", // Can be restrictive for some use cases
      "react-native/sort-styles": "warn",

      // React Hooks (explicitly defined for clarity)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // Expo/Metro specific configuration
  {
    files: ["metro.config.js", "babel.config.js", "expo.json", "app.json"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
    },
  },

  // Test files configuration
  {
    files: [
      "**/*.test.{js,ts,tsx}",
      "**/*.spec.{js,ts,tsx}",
      "**/__tests__/**",
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-native/no-inline-styles": "off",
    },
  },

  // Prettier configuration (must be last to override other formatting rules)
  configPrettier,
];
