import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    client: 'src/client.ts'
  },
  format: ['cjs', 'esm'],
  dts: {
    entry: {
      index: 'src/index.ts',
      server: 'src/server.ts',
      client: 'src/client.ts'
    }
  },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['ws', 'openai', 'uuid'],
  splitting: false,
  tsconfig: 'tsconfig.build.json'
})