import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import pythonCode from './run.py?raw'
import type { RunCode, WorkerResponse } from './types'

self.onmessage = async ({ data }: { data: RunCode }) => {
  const { files, warmup } = data
  let msg = ''
  try {
    const [setupTime, pyodide] = await time(getPyodide())
    if (setupTime > 50) {
      msg += `Started Python in ${setupTime.toFixed(0)}ms, `
    }
    post({ kind: 'status', message: `${msg}Installing dependencies…` })

    const [installTime, installedJson] = await time(
      pyodide.runPythonAsync('import run; run.install_deps(files)', {
        globals: pyodide.toPy({ files: files }),
      }),
    )
    const installed = JSON.parse(installedJson as string)
    if (installed) {
      post({ kind: 'installed', installed })
    }
    if (installTime > 50) {
      msg += `Installed dependencies in ${installTime.toFixed(0)}ms, `
    }
    if (warmup) {
      post({ kind: 'status', message: `${msg}Ready` })
      return
    }
    post({ kind: 'status', message: `${msg}running code…` })

    const activeFile = files.find((f) => f.active)!.name
    const [execTime] = await time(
      pyodide.runPythonAsync('import run; run.run_code(file)', {
        globals: pyodide.toPy({ file: activeFile }),
      }),
    )
    postPrint()
    post({ kind: 'status', message: `${msg}ran code in ${execTime.toFixed(0)}ms` })
  } catch (err) {
    console.error(err)
    post({ kind: 'status', message: `${msg}Error occurred` })
    post({ kind: 'error', message: (err as any).toString() })
  }
}

async function time<T>(promise: Promise<T>): Promise<[number, T]> {
  const start = performance.now()
  const result = await promise
  return [performance.now() - start, result]
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
    pathlib.Path('run.py').write_text(pythonCode)
    pyodide.pyimport('run')

    loadedPyodide = pyodide
  }
  return loadedPyodide
}

function setupStreams(pyodide: PyodideInterface) {
  const { FS } = pyodide
  const { TTY } = (pyodide as any)._module
  const mytty = FS.makedev(FS.createDevice.major++, 0)
  const myttyerr = FS.makedev(FS.createDevice.major++, 0)
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
