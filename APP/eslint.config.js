import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig( [
  globalIgnores( [
    'dist',
    'build',
    'coverage',
    'node_modules',
    '*.revisado.*'
  ] ),

  // Código da aplicação React executado no navegador.
  {
    files: [ 'src/**/*.{js,jsx}' ],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      // O projeto usa o JSX Transform moderno, então `import React from 'react'`
      // pode existir durante a migração sem ser usado diretamente.
      'no-unused-vars': [ 'error', {
        varsIgnorePattern: '^React$',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true
      } ],

      // Durante a refatoração dos componentes, estes avisos são úteis,
      // mas não devem bloquear o build/check do projeto inteiro.
      'no-useless-assignment': 'warn',
      'react-refresh/only-export-components': [ 'warn', { allowConstantExport: true } ],
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn'
    }
  },

  // Arquivos de configuração executados no Node.js, não no browser.
  {
    files: [
      '*.config.js',
      '*.config.mjs',
      '*.config.cjs',
      'vite.config.js',
      'eslint.config.js'
    ],
    extends: [ js.configs.recommended ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    }
  }
] );