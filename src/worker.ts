import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import pythonCode from './main.py?raw'
import type { RunCode, WorkerResponse } from './messageTypes'

self.onmessage = async ({ data }: { data: RunCode }) => {
  const { user_code, warmup } = data
  let msg = ''
  try {
    const startSetupTime = performance.now()
    const pyodide = await getPyodide()
    const setupTime = performance.now() - startSetupTime
    if (setupTime > 50) {
      msg += `Started Python in ${setupTime.toFixed(0)}ms, `
    }
    post({ kind: 'status', message: `${msg}Installing dependencies…` })
    const startInstallTime = performance.now()
    const options = { globals: pyodide.toPy({ user_code }) }
    const installedJson: string = await pyodide.runPythonAsync('import main; main.install_deps(user_code)', options)
    const installed = JSON.parse(installedJson)
    if (installed) {
      post({ kind: 'installed', installed })
    }
    const installTime = performance.now() - startInstallTime
    if (installTime > 50) {
      msg += `Installed dependencies in ${installTime.toFixed(0)}ms, `
    }
    if (warmup) {
      post({ kind: 'status', message: `${msg}Ready` })
      return
    }
    post({ kind: 'status', message: `${msg}running code…` })
    const startExecTime = performance.now()
    await pyodide.runPythonAsync('import main; main.run_code(user_code)', options)
    const execTime = performance.now() - startExecTime
    postPrint()
    post({ kind: 'status', message: `${msg}ran code in ${execTime.toFixed(0)}ms` })
  } catch (err) {
    console.error(typeof err)
    post({ kind: 'status', message: `${msg}Error occurred` })
    post({ kind: 'error', message: (err as any).toString() })
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

    const pathlib = pyodide.pyimport('pathlib')
    pathlib.Path('main.py').write_text(pythonCode)
    pyodide.pyimport('main')

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
