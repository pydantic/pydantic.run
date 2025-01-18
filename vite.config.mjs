import { defineConfig } from 'vite'
// vite-plugin-monaco-editor-esm avoids a warning from monaco about workers not working
import monacoEditorEsmPlugin from 'vite-plugin-monaco-editor-esm'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [monacoEditorEsmPlugin({}), solidPlugin()],
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
})
