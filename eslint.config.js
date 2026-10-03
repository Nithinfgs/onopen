import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['examples/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true }],
    },
  },
];
