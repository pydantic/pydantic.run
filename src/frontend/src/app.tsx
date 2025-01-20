import { createSignal, onMount } from 'solid-js'

import Convert from 'ansi-to-html'
import Editor from './editor'
import Worker from './worker?worker'
import type { WorkerResponse, RunCode, File } from './types'

const decoder = new TextDecoder()
const ansiConverter = new Convert()

export default function () {
  const [status, setStatus] = createSignal('Launching Python...')
  const [installed, setInstalled] = createSignal('')
  const [outputHtml, setOutputHtml] = createSignal('')
  let terminalOutput = ''
  let worker: Worker
  let outputRef!: HTMLPreElement

  onMount(async () => {
    worker = new Worker()
    worker.onmessage = ({ data }: { data: WorkerResponse }) => {
      if (data.kind == 'print') {
        for (const chunk of data.data) {
          const arr = new Uint8Array(chunk)
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
  })

  async function runCode(files: File[], warmup: boolean = false) {
    setStatus('Launching Python...')
    setInstalled('')
    setOutputHtml('')
    terminalOutput = ''
    const data: RunCode = { files, warmup }
    worker!.postMessage(data)
  }

  // noinspection JSUnusedAssignment
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
        <Editor runCode={runCode} />
        <div class="col">
          <div class="status my-5">{status()}</div>
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
