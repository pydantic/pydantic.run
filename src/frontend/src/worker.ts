/* eslint @typescript-eslint/no-explicit-any: off */
import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import installPythonCode from './install_dependencies.py?raw'
import type { CodeFile, RunCode, WorkerResponse } from './types'

interface InstallSuccess {
  kind: 'success'
  message: string
}
interface InstallError {
  kind: 'error'
  message: string
}

self.onmessage = ({ data }: { data: RunCode }) => {
  const { serverSide, files } = data
  if (serverSide) {
    runOnServer(files)
  } else {
    runInBrowser(files)
  }
}

async function runInBrowser(files: CodeFile[]) {
  let msg = ''
  try {
    const [setupTime, { pyodide, installDeps }] = await time(getPyodideEnv())
    if (setupTime > 50) {
      msg += `Started Python in ${asMs(setupTime)}, `
    }
    post({ kind: 'status', message: `${msg}Installing dependencies…` })
    const sys = pyodide.pyimport('sys')

    const [installTime, installStatus]: [number, InstallSuccess | InstallError] = await time(
      installDeps.install_deps(pyodide.toPy(files)),
    )
    sys.stdout.flush()
    sys.stderr.flush()
    if (installStatus.kind == 'error') {
      post({ kind: 'status', message: `${msg}Error occurred` })
      post({ kind: 'error', message: installStatus.message })
      return
    }
    post({ kind: 'installed', message: installStatus.message })
    if (installTime > 50) {
      msg += `Installed dependencies in ${asMs(installTime)}, `
    }
    post({ kind: 'status', message: `${msg}running code…` })

    const active = findActive(files)
    const activeFile = files.find((f) => f.activeIndex === active)!
    const [execTime] = await time(
      pyodide.runPythonAsync(activeFile.content, {
        globals: pyodide.toPy({ __name__: '__main__' }),
        filename: activeFile.name,
      }),
    )
    sys.stdout.flush()
    sys.stderr.flush()
    postPrint()
    post({ kind: 'status', message: `${msg}ran code in ${asMs(execTime)}` })
  } catch (err) {
    console.warn(err)
    post({ kind: 'status', message: `${msg}Error occurred` })
    post({ kind: 'error', message: formatError(err) })
  }
}

async function runOnServer(files: CodeFile[]) {
  const active = findActive(files)
  const activeFile = files.find((f) => f.activeIndex === active)!
  post({ kind: 'status', message: `Running code on sandbox.pydantic.run…` })
  try {
    const [fetchTime, response] = await time(
      fetch('/sandbox/run/', {
        method: 'POST',
        body: activeFile.content,
        headers: {
          'file-name': activeFile.name,
        },
      }),
    )
    if (response.ok) {
      const data: RunResult = await response.json()
      let text = data.stream.map(({ v }) => v).join('')
      if (data.result.status === 'error') {
        text += `\n\n${data.result.error}`
      } else if ((data.mode == 'main' || data.mode == 'async-main') && data.result.return_value !== null) {
        text += `\n\nmain return value: ${JSON.stringify(data.result.return_value)}`
      }
      post({
        kind: 'status',
        message: `Ran code on sandbox.pydantic.run in ${asMs(fetchTime)}, execution time ${asMs(data.run_time * 1000)}`,
      })
      post({ kind: 'print', data: [new TextEncoder().encode(text)] })
    } else {
      const text = await response.text()
      console.warn(`Error running code in sandbox: ${response.status}:`, text)
      post({ kind: 'status', message: 'Error running code in sandbox' })
      post({ kind: 'error', message: `${response.status}: ${text}` })
    }
  } catch (err) {
    console.warn(err)
    post({ kind: 'status', message: 'Error occurred' })
    post({ kind: 'error', message: (err as any).toString() })
  }
}

interface RunResult {
  stream: { s: 'out' | 'err'; v: string; t: number }[]
  mode: 'main' | 'async-main' | 'no-main-function' | 'unknown'
  result: { status: 'error'; error: string } | { status: 'success'; return_value: any }
  run_time: number
}

function formatError(err: any): string {
  let errStr = (err as any).toString()
  if (!errStr.startsWith('PythonError:')) {
    return `${errStr}\n\nSome browsers and platforms (like iPhones) don't support running Python, sorry.`
  }
  errStr = errStr.replace(/^PythonError: +/, '')
  // remove frames from inside pyodide
  errStr = errStr.replace(/ {2}File "\/lib\/python\d+\.zip\/_pyodide\/.*\n {4}.*\n(?: {4,}\^+\n)?/g, '')
  return errStr
}

function asMs(time: number) {
  if (time < 100) {
    return `${time.toFixed(2)}ms`
  } else {
    return `${time.toFixed(0)}ms`
  }
}

async function time<T>(promise: Promise<T>): Promise<[number, T]> {
  const start = performance.now()
  const result = await promise
  const end = performance.now()
  return [end - start, result]
}

interface PyodideEnv {
  pyodide: PyodideInterface
  installDeps: any
}

// we rerun this on every invocation to avoid issues with conflicting packages
async function getPyodideEnv(): Promise<PyodideEnv> {
  const pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
    packages: ['micropip'],
  })
  const sys = pyodide.pyimport('sys')
  const pv = sys.version_info
  post({
    kind: 'versions',
    python: `${pv.major}.${pv.minor}.${pv.micro}`,
    pyodide: pyodide.version,
  })
  setupStreams(pyodide)

  const dirPath = '/tmp/pydantic_run'
  sys.path.append(dirPath)
  const pathlib = pyodide.pyimport('pathlib')
  pathlib.Path(dirPath).mkdir()
  const moduleName = '_install_dependencies'
  pathlib.Path(`${dirPath}/${moduleName}.py`).write_text(installPythonCode)

  return {
    pyodide,
    installDeps: pyodide.pyimport(moduleName),
  }
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

export const findActive = (files: CodeFile[]): number =>
  files.reduce((acc, { activeIndex }) => Math.max(acc, activeIndex), 0)
