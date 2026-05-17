import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/meow': 'src/index.ts',
    'bin/meow-mcp': 'src/mcp/server.ts',
    'bin/meow-eval': 'src/eval/harness.ts',
    'bin/meow-skills': 'src/skills/cli.ts',
  },
  format: ['esm'],
  splitting: false,
  sourcemap: false,
  minify: false,
  clean: true,
  external: ['bun'],
  noExternal: ['@modelcontextprotocol/sdk'],
})