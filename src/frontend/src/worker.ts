/* eslint @typescript-eslint/no-explicit-any: off */
import { loadPyodide, PyodideInterface, version as pyodideVersion } from 'pyodide'
import preparePythonEnvCode from './prepare_env.py?raw'
import type { CodeFile, RunCode, WorkerResponse } from './types'

interface PrepareSuccess {
  kind: 'success'
  message: string
}
interface PrepareError {
  kind: 'error'
  message: string
}

self.onmessage = async ({ data }: { data: RunCode }) => {
  const { files } = data
  let msg = ''
  try {
    const [setupTime, { pyodide, preparePyEnv }] = await time(getPyodideEnv())
    if (setupTime > 50) {
      msg += `Started Python in ${asMs(setupTime)}, `
    }
    post({ kind: 'status', message: `${msg}Installing dependencies…` })
    const sys = pyodide.pyimport('sys')

    const [installTime, prepareStatus] = await time(preparePyEnv.prepare_env(pyodide.toPy(files)))
    sys.stdout.flush()
    sys.stderr.flush()
    if (prepareStatus.kind == 'error') {
      post({ kind: 'status', message: `${msg}Error occurred` })
      post({ kind: 'error', message: prepareStatus.message })
      return
    }
    post({ kind: 'installed', message: prepareStatus.message })
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
    post({ kind: 'end' })
  } catch (err) {
    postPrint()
    console.warn(err)
    post({ kind: 'status', message: `${msg}Error occurred` })
    post({ kind: 'error', message: formatError(err) })
    post({ kind: 'end' })
  }
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
  // matches the signature of the `prepare_env` function in prepare_env.py
  preparePyEnv: { prepare_env: (files: any) => Promise<PrepareSuccess | PrepareError> }
}

// see https://github.com/pyodide/micropip/issues/201
const micropipV09 =
  'https://files.pythonhosted.org/packages/27/6d/195810e3e73e5f351dc6082cada41bb4d5b0746a6804155ba6bae4304612/micropip-0.9.0-py3-none-any.whl'

// we rerun this on every invocation to avoid issues with conflicting packages
async function getPyodideEnv(): Promise<PyodideEnv> {
  const pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
    packages: [micropipV09],
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
  const moduleName = '_prepare_env'
  pathlib.Path(`${dirPath}/${moduleName}.py`).write_text(preparePythonEnvCode)

  return {
    pyodide,
    preparePyEnv: pyodide.pyimport(moduleName),
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

let chunks: Uint8Array[] = []
let last_post = 0

function print(tty: any) {
  const output: number[] | null = tty.output
  if (output && output.length > 0) {
    chunks.push(new Uint8Array(output))
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
