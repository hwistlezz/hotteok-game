import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    license: { fileName: 'third-party-licenses.txt' },
    rolldownOptions: { output: { postBanner: '/* Third-party licenses: /third-party-licenses.txt */' } },
  },
  test: { include: ['tests/unit/**/*.test.ts'] },
})
