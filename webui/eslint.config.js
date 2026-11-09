import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

// eslint-plugin-react is not released for ESLint 10; @eslint-react replaces it.
// Only the counterparts of what plugin:react/recommended checked are enabled
// here — duplicate JSX props, undefined JSX names and string refs are caught by
// TypeScript. The recommended sets of @eslint-react and of react-hooks 7 have
// grown React Compiler rules since (set-state-in-effect, purity, …); adopting
// those is a separate decision, not part of the ESLint upgrade.
const reactBase = eslintReact.configs['recommended-typescript'];

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...reactBase,
    rules: {
      '@eslint-react/no-missing-key': 'error',
      '@eslint-react/jsx-no-key-after-spread': 'error',
      '@eslint-react/jsx-no-children-prop': 'error',
      '@eslint-react/jsx-no-comment-textnodes': 'error',
      '@eslint-react/no-direct-mutation-state': 'error',
      '@eslint-react/no-access-state-in-setstate': 'error',
      '@eslint-react/no-component-will-mount': 'error',
      '@eslint-react/no-unsafe-component-will-mount': 'error',
      '@eslint-react/dom-no-dangerously-set-innerhtml-with-children': 'error',
      '@eslint-react/dom-no-find-dom-node': 'error',
      '@eslint-react/dom-no-render-return-value': 'error',
      '@eslint-react/dom-no-unsafe-target-blank': 'error',
      '@eslint-react/dom-no-unknown-property': 'error',
      '@eslint-react/dom-no-script-url': 'error',
      '@eslint-react/dom-no-void-elements-with-children': 'error'
    }
  },
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      // Kept in sync with host/eslint.config.js — see the reasoning there.
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
);
