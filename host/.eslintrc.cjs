module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist'],
  rules: {
    // Every hit was a deliberately swallowed push onto a stream the client has
    // already closed. Reporting them buries the empty block that is a mistake.
    'no-empty': ['error', { allowEmptyCatch: true }],

    // `while (true)` around a stream reader, exited by break. ESLint 9 stopped
    // flagging this by default; until the upgrade the option does it here.
    'no-constant-condition': ['error', { checkLoops: false }],

    // `_name` is how this codebase marks a parameter it must accept and does
    // not use — typically when implementing an interface or a test double.
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }]
  }
};
