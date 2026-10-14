// Flat ESLint config (BWB-013). Type-aware rules apply to TypeScript only; plain scripts use the recommended set.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/vendor/**', 'docs/**', 'pnpm-lock.yaml'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-var': 'error', 'prefer-const': 'error', eqeqeq: ['error', 'always'] },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Source-level boundary rule (ADR 0010): packages shared with PHP or the theme build, and the add-ons, must not
    // import React, Zustand, dnd-kit or Tailwind; nothing may import GSAP (ADR 0008).
    files: [
      'packages/{core,design-tokens,capabilities,element-registry,style-engine,canvas-bridge,extension-api}/**/*.{js,mjs,cjs,ts,tsx}',
      'wordpress/{theme,plus,pro}/**/*.{js,mjs,cjs,ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'zustand',
                'zustand/*',
                '@dnd-kit/*',
                'tailwindcss',
                'tailwindcss/*',
              ],
              message: 'This package must stay framework-free (ADR 0010).',
            },
            { group: ['gsap', 'gsap/*', '@gsap/*'], message: 'GSAP is not approved (ADR 0008).' },
          ],
        },
      ],
    },
  },
  {
    // The core package runs in the browser editor and is mirrored by PHP: no Node APIs in its source (tests and scripts may).
    files: ['packages/core/src/**/*.{ts,js,mjs}'],
    ignores: ['packages/core/src/**/*.test.{ts,js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'packages/core source must not use Node APIs (it runs in the browser editor).',
            },
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'zustand',
                'zustand/*',
                '@dnd-kit/*',
                'tailwindcss',
                'tailwindcss/*',
              ],
              message: 'This package must stay framework-free (ADR 0010).',
            },
            { group: ['gsap', 'gsap/*', '@gsap/*'], message: 'GSAP is not approved (ADR 0008).' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: [
      'packages/{core,design-tokens,capabilities,element-registry,style-engine,canvas-bridge,extension-api}/**',
      'wordpress/{theme,plus,pro}/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['gsap', 'gsap/*', '@gsap/*'], message: 'GSAP is not approved (ADR 0008).' }] },
      ],
    },
  },
  {
    // React rules apply only where React is allowed (ADR 0010): editor-ui, apps/editor, wordpress/plugin.
    files: ['packages/editor-ui/**/*.{ts,tsx}', 'apps/editor/**/*.{ts,tsx}', 'wordpress/plugin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: { ...reactHooks.configs.recommended.rules, ...jsxA11y.flatConfigs.recommended.rules },
  },
  prettier,
);
