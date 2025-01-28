import { createSignal, onMount } from 'solid-js'

import Convert from 'ansi-to-html'
import Editor from './editor'
import Worker from './worker?worker'
import type { WorkerResponse, RunCode, CodeFile } from './types'
import { Examples } from './examples'

const decoder = new TextDecoder()
const ansiConverter = new Convert({ colors: { 1: '#CE9178', 4: '#569CD6', 5: '#BD00BD' } })

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
        // escape HTML codes in the terminal output
        const escapedOutput = escapeHTML(terminalOutput)
        // replace ansi links with html links since ansi-to-html doesn't support this properly
        let terminalHtml = replaceAnsiLinks(escapedOutput)
        // convert other ansi codes to html
        terminalHtml = ansiConverter.toHtml(terminalHtml)
        // set the output
        setOutputHtml(terminalHtml)
        // scrolls to the bottom of the div
        outputRef.scrollTop = outputRef.scrollHeight
      }
    }
  })

  async function runCode(files: CodeFile[], warmup: boolean = false) {
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
        <aside>
          Python browser sandbox, see{' '}
          <a href="https://github.com/pydantic/pydantic.run" target="_blank">
            github.com/pydantic/pydantic.run
          </a>{' '}
          for more info.
        </aside>
        <Examples />
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

// hellish regex to replace ansi links with html links since ansi-to-html doesn't know how
// warning this may be very bittle! it's written to work for the logfire project URL currently printed
// by the logfire SDK
function replaceAnsiLinks(terminalOutput: string): string {
  return terminalOutput.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b]8;id=\d+;(.+?)\u001b\\\u001b\[4;\d+m(.+?)\u001b\[0m\u001b]8;;\u001b\\/g,
    (_, url, text) => `<a href="${url}" target="_blank">${text}</a>`,
  )
}
