import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    include: ["src/**/*.test.ts"],
    typecheck: {
      enabled: true,
    },
    testTimeout: 10000,  // 10 seconds
  },
}) 