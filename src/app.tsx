import { createSignal, onMount } from 'solid-js'

import Convert from 'ansi-to-html'
import Editor from './editor'
import Worker from './worker?worker'
import defaultPythonCode from './default_code.py?raw'
import type { WorkerResponse, RunCode, File } from './types'

const decoder = new TextDecoder()
const ansiConverter = new Convert()

export default function () {
  const [status, setStatus] = createSignal('Launching Python...')
  const [installed, setInstalled] = createSignal('')
  // const [output, setOutput] = createSignal('')
  const [outputHtml, setOutputHtml] = createSignal('')
  let terminalOutput = ''
  let worker: Worker
  let outputRef!: HTMLPreElement

  const [files, setFiles] = createSignal<File[]>(getFiles())

  function workerMessage(warmup: boolean = false) {
    const data: RunCode = { files: files(), warmup }
    worker!.postMessage(data)
  }

  function runCode(newContent: string) {
    setFiles((prev) =>
      prev.map(({ name, content, active }) => {
        if (active) {
          return { name, content: newContent, active }
        } else {
          return { name, content, active }
        }
      }),
    )
    setStatus('Launching Python...')
    setInstalled('')
    setOutputHtml('')
    terminalOutput = ''
    workerMessage()
  }

  // function changeTab(updateContent: string, newName: string) {
  //   setFiles((prev) =>
  //     prev.map(({ name, content, active }) => {
  //       if (name == newName) {
  //         return { name, content, active: true }
  //       } else if (active) {
  //         return { name, content: updateContent, active: false }
  //       } else {
  //         return { name, content, active }
  //       }
  //     }),
  //   )
  // }
  //
  // function newTab() {
  //   const newFileName = getNewName(files())
  //   if (newFileName) {
  //     const file: File = { name: newFileName, content: '', active: true }
  //     setFiles((prev) => [...prev.map(({ name, content }) => ({ name, content, active: false })), file])
  //   }
  // }
  //
  // function closeTab(name: string) {
  //
  // }

  onMount(() => {
    worker = new Worker()
    worker.onmessage = ({ data }: { data: WorkerResponse }) => {
      if (data.kind == 'print') {
        for (let chunk of data.data) {
          let arr = new Uint8Array(chunk)
          terminalOutput += decoder.decode(arr)
        }
      } else if (data.kind == 'error') {
        terminalOutput += data.message
      } else if (data.kind == 'installed') {
        setInstalled(`Installed dependencies: ${data.installed.join(', ')}`)
      } else {
        setStatus(data.message)
      }
      setOutputHtml(ansiConverter.toHtml(escapeHTML(terminalOutput)))
      // scrolls to the bottom of the div
      outputRef.scrollTop = outputRef.scrollHeight
    }
    workerMessage(true)
  })

  return (
    <main>
      <header>
        <h1>logfire.run</h1>
        <aside>
          Run Python in the browser, log with <a href="https://pydantic.dev/logfire">logfire</a>.
        </aside>
        <div id="counter"></div>
      </header>
      <section>
        <Editor runCode={runCode} files={files} setFiles={setFiles} />
        <div class="col">
          <div class="status">{status()}</div>
          <div class="installed">{installed()}</div>
          <pre class="output" innerHTML={outputHtml()} ref={outputRef}></pre>
        </div>
      </section>
    </main>
  )
}

const escapeEl = document.createElement('textarea')
function escapeHTML(html: string): string {
  escapeEl.textContent = html
  return escapeEl.innerHTML
}

function getFiles(): File[] {
  const url = new URL(window.location.href)
  const base64Code = url.searchParams.get('code')
  const content = base64Code ? atob(base64Code) : defaultPythonCode
  return [{ name: 'main.py', content, active: true }]
}
