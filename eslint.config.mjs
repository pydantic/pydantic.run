import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(eslint.configs.recommended, tseslint.configs.recommended, {
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    // Override specific rules here
    '@typescript-eslint/no-explicit-any': 'off',
  },
})
