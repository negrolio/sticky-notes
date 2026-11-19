/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the build works under the GitHub Pages subpath.
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Vitest blanks CSS imports by default; ?raw ones keep their text so tests can read the rules.
    css: { include: [/\.css\?raw$/] },
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'] },
  },
})
