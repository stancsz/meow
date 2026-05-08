import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", "tmp", "scratch"],
    setupFiles: ["tests/utils/setup.ts"],
    globals: {
      vi: true,
      describe: true,
      it: true,
      expect: true,
      beforeEach: true,
      afterEach: true,
      beforeAll: true,
      afterAll: true,
    },
  },
});
