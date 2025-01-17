import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import runPyCode from './run.py?raw'

self.onmessage = async ({ data }) => {
  try {
    const pyodide = await getPyodide()
    await pyodide.runPythonAsync(runPyCode, { globals: pyodide.toPy({ user_code: data }) })
    post()
  } catch (err) {
    console.error(err)
    self.postMessage(`Error: ${err}\n`)
  }
}

let loadedPyodide: PyodideInterface | null = null

async function getPyodide(): Promise<PyodideInterface> {
  if (!loadedPyodide) {
    const pyodide = await loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
    })
    console.log('Pyodide version', pyodide.version)
    setupStreams(pyodide)
    await pyodide.loadPackage(['micropip', 'pygments'])
    loadedPyodide = pyodide
  }
  return loadedPyodide
}

function setupStreams(pyodide: PyodideInterface) {
  const { FS } = pyodide
  const { TTY } = (pyodide as any)._module
  let mytty = FS.makedev(FS.createDevice.major++, 0)
  let myttyerr = FS.makedev(FS.createDevice.major++, 0)
  TTY.register(mytty, makeTtyOps())
  TTY.register(myttyerr, makeTtyOps())
  FS.mkdev('/dev/mytty', mytty)
  FS.mkdev('/dev/myttyerr', myttyerr)
  FS.unlink('/dev/stdin')
  FS.unlink('/dev/stdout')
  FS.unlink('/dev/stderr')
  FS.symlink('/dev/mytty', '/dev/stdin')
  FS.symlink('/dev/mytty', '/dev/stdout')
  FS.symlink('/dev/myttyerr', '/dev/stderr')
  FS.closeStream(0)
  FS.closeStream(1)
  FS.closeStream(2)
  FS.open('/dev/stdin', 0)
  FS.open('/dev/stdout', 1)
  FS.open('/dev/stderr', 1)
}

function makeTtyOps() {
  return {
    put_char(tty: any, val: any) {
      if (val !== null) {
        tty.output.push(val)
      }
      if (val === null || val === 10) {
        print(tty)
      }
    },
    fsync(tty: any) {
      print(tty)
    },
  }
}

let chunks: string[] = []
let last_post = 0

function print(tty: any) {
  if (tty.output && tty.output.length > 0) {
    chunks.push(tty.output)
    tty.output = []
    const now = performance.now()
    if (now - last_post > 100) {
      post()
      last_post = now
    }
  }
}

function post() {
  self.postMessage(chunks)
  chunks = []
}
