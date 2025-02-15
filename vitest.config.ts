import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    typecheck: {
      enabled: true,
    },
    testTimeout: 10000,  // 10 seconds
  },
}) 