import { createEffect, createSignal, onMount } from 'solid-js'

import Convert from 'ansi-to-html'
import Editor from './editor'
import Worker from './worker?worker'
import type { WorkerResponse, RunCode, File } from './types'
import { store, retrieve } from './store'

const decoder = new TextDecoder()
const ansiConverter = new Convert()

export default function () {
  const [status, setStatus] = createSignal('Launching Python...')
  const [installed, setInstalled] = createSignal('')
  const [outputHtml, setOutputHtml] = createSignal('')
  let terminalOutput = ''
  let worker: Worker
  let outputRef!: HTMLPreElement

  const [files, setFiles] = createSignal<File[] | null>(null)
  const [save, setSave] = createSignal(false)

  function workerMessage(files: File[], warmup: boolean = false) {
    const data: RunCode = { files, warmup }
    worker!.postMessage(data)
  }

  async function checkSave(save: boolean) {
    if (save) {
      try {
        await store(files())
      } catch (err) {
        setStatus(`Failed to save: ${err}`)
      }
    }
  }

  async function runCode(newContent: string) {
    setFiles((prev) =>
      (prev || []).map(({ name, content, active }) => {
        if (active) {
          return { name, content: newContent, active }
        } else {
          return { name, content, active }
        }
      }),
    )
    await checkSave(save())
    setStatus('Launching Python...')
    setInstalled('')
    setOutputHtml('')
    terminalOutput = ''
    const _files = files()
    if (_files) {
      workerMessage(_files)
    }
  }

  createEffect(async () => {
    await checkSave(save())
  })

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
    const files = await retrieve()
    setFiles(files)
    workerMessage(files, true)
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
        <Editor runCode={runCode} files={files} save={save} setSave={setSave} setFiles={setFiles} />
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
