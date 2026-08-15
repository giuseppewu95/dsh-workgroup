import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [{
    name: 'css-stub',
    enforce: 'pre',
    resolveId(source: string) {
      if (source.endsWith('.css')) return `\0css:${source}`
      return null
    },
    load(id: string) {
      if (id.startsWith('\0css:')) return 'export default {}'
      return null
    },
  }],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    globals: false,
    testTimeout: 20_000,
    css: false,
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-ui-primitives/],
      },
    },
  },
})
