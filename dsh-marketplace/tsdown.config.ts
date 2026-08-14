import { defineConfig } from 'tsdown'

const platformModules = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig([
  {
    name: 'dsh-marketplace/host',
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    platform: 'node',
    format: 'esm',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: 'dsh-marketplace/client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    platform: 'browser',
    format: 'cjs',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: { neverBundle: platformModules },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "untr-dsh-marketplace", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
