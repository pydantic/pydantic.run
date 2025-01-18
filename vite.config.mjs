import { defineConfig } from 'vite'
// vite-plugin-monaco-editor-esm avoids a warning from monaco about workers not working
import monacoEditorEsmPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  plugins: [monacoEditorEsmPlugin({})],
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
})
