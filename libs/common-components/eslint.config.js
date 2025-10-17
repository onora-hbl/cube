const { defineConfig, globalIgnores } = require('eslint/config')

const tsParser = require('@typescript-eslint/parser')
const _import = require('eslint-plugin-import')

const { fixupPluginRules, fixupConfigRules } = require('@eslint/compat')

const js = require('@eslint/js')

const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      ecmaVersion: 2023,

      parserOptions: {
        project: './tsconfig.json',
      },
    },

    plugins: {
      import: fixupPluginRules(_import),
    },

    extends: fixupConfigRules(
      compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/typescript',
        'prettier',
      ),
    ),

    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      'import/order': 'off',
    },
  },
  globalIgnores(['**/dist/', '**/node_modules/', 'eslint.config.js']),
])
