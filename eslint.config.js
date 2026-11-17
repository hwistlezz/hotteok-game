import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'playwright-report/**', 'test-results/**', '.wrangler/**', '.tool-cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
