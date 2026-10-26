import { createLogger, defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

const customLogger = createLogger()
const loggerWarn = customLogger.warn

customLogger.warn = (msg, options) => {
  // ignore warnings from pyodide
  if (!msg.includes('has been externalized for browser compatibility')) {
    loggerWarn(msg, options)
  }
}

export default defineConfig({
  plugins: [solidPlugin()],
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 5000,
    sourcemap: true,
  },
  customLogger,
})
