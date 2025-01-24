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
  const [versions, setVersions] = createSignal('')
  let terminalOutput = ''
  let worker: Worker
  let outputRef!: HTMLPreElement

  onMount(async () => {
    worker = new Worker()
    worker.onmessage = ({ data }: { data: WorkerResponse }) => {
      let newTerminalOutput = false
      if (data.kind == 'print') {
        newTerminalOutput = true
        for (const chunk of data.data) {
          const arr = new Uint8Array(chunk)
          terminalOutput += decoder.decode(arr)
        }
      } else if (data.kind == 'status') {
        setStatus(data.message)
      } else if (data.kind == 'error') {
        newTerminalOutput = true
        terminalOutput += data.message
      } else if (data.kind == 'installed') {
        setInstalled(data.message.length > 0 ? `Installed dependencies: ${data.message}` : '')
      } else {
        setVersions(data.message)
      }

      if (newTerminalOutput) {
        // console.log('escapeHTML(terminalOutput)', {escaedterminalOutput: escapeHTML(terminalOutput)})
        // console.log('ansiConverter.toHtml(escapeHTML(terminalOutput))', ansiConverter.toHtml(escapeHTML(terminalOutput)))
        setOutputHtml(ansiConverter.toHtml(escapeHTML(replaceAnsiLinks(terminalOutput))))
        // scrolls to the bottom of the div
        outputRef.scrollTop = outputRef.scrollHeight
      }
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
        <h1>pydantic.run</h1>
        <aside>Python browser sandbox.</aside>
        <div id="counter"></div>
      </header>
      <section>
        <Editor runCode={runCode} />
        <div class="col">
          <div class="status my-5">{status()}</div>
          <div class="installed">{installed()}</div>
          <pre class="output" innerHTML={outputHtml()} ref={outputRef}></pre>
          <div class="status text-right smaller">{versions()}</div>
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

function replaceAnsiLinks(terminalOutput: string): string {
  // '\u001b]8;id=651476;
  return terminalOutput.replace(/\\u001b]8;id=\d+;/g, '\u001b]8;;')
}
