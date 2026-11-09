import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      // Every hit was a deliberately swallowed push onto a stream the client has
      // already closed. Reporting them buries the empty block that is a mistake.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // 863 hits across host and webui, grown over the life of the codebase.
      // As an error the lint never exits clean, and a new problem is invisible
      // among them; as a warning it stays counted and visible without hiding
      // what is actionable today. Not switched off — the backlog is real.
      '@typescript-eslint/no-explicit-any': 'warn',

      // `_name` is how this codebase marks a parameter it must accept and does
      // not use — typically when implementing an interface or a test double.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
);
