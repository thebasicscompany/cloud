import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const globals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  RequestInit: 'readonly',
  Response: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
}

export default [
  {
    ignores: [
      '.sst/**',
      'node_modules/**',
      'vendor/**',
      '**/.next/**',
      '**/sst-env.d.ts',
      '**/dist/**',
      '**/dist-bundle/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals,
    },
    rules: {
      'no-undef': 'off',
      'no-case-declarations': 'off',
      'no-constant-binary-expression': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'no-extra-boolean-cast': 'off',
      'no-prototype-builtins': 'off',
      'no-unsafe-optional-chaining': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      'preserve-caught-error': 'off',
    },
  },
  // Web components carry `eslint-disable` directives for rules from the Next.js /
  // react-hooks plugins, which the web app's own (Next) lint loads but this
  // workspace flat-config does not. Register them as no-ops so those directives
  // resolve here instead of erroring "Definition for rule … was not found" —
  // behavior is unchanged (the rules were never active in this config), and it
  // adds no dependency. Proper long-term fix: adopt eslint-config-next for web/.
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': { rules: { 'exhaustive-deps': { create: () => ({}) } } },
      '@next/next': { rules: { 'no-img-element': { create: () => ({}) } } },
    },
  },
]
