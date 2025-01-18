import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import runPyCode from './run.py?raw'
import type { RunCode, WorkerResponse } from './messageTypes'

self.onmessage = async ({ data }: { data: RunCode }) => {
  const { user_code } = data
  try {
    const startTime = performance.now()
    const pyodide = await getPyodide()
    await pyodide.runPythonAsync(runPyCode, { globals: pyodide.toPy({ user_code }) })
    postPrint()
    if (user_code === null) {
      post({ kind: 'status', message: 'Ready' })
    } else {
      const endTime = performance.now()
      post({ kind: 'status', message: `Finished, execution time: ${(endTime - startTime).toFixed(2)}ms` })
    }
  } catch (err) {
    console.error(err)
    post({ kind: 'status', message: `Error: ${err}` })
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

let chunks: ArrayBuffer[] = []
let last_post = 0

function print(tty: any) {
  if (tty.output && tty.output.length > 0) {
    chunks.push(tty.output)
    tty.output = []
    const now = performance.now()
    if (now - last_post > 100) {
      postPrint()
      last_post = now
    }
  }
}

function postPrint() {
  post({ kind: 'print', data: chunks })
  chunks = []
}

function post(response: WorkerResponse) {
  self.postMessage(response)
}
