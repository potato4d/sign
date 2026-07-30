import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.ts'],
}));

export default tseslint.config(
  {
    ignores: ['coverage/**', 'node_modules/**', 'out/**', 'release/**'],
  },
  {
    ...eslint.configs.recommended,
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ...eslint.configs.recommended,
    files: ['**/*.ts'],
  },
  ...typedConfigs,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.main.json', './tsconfig.renderer.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: [
      'electron.vite.config.ts',
      'vitest.config.ts',
      'src/main/**/*.ts',
      'src/main/**/*.test.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/renderer/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
);
