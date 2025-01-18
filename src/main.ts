import Convert from 'ansi-to-html'

import './style.css'
import PyodideWorker from './worker?worker'
import defaultPythonCode from './default_code.py?raw'
import type { RunCode, WorkerResponse } from './messageTypes'

const escapeEl = document.createElement('textarea')
function escapeHTML(html: string): string {
  escapeEl.textContent = html
  return escapeEl.innerHTML
}

const statusEl = document.getElementById('status')!
const outputEl = document.getElementById('output')!
const decoder = new TextDecoder()
const ansi_converter = new Convert()
let terminal_output = ''

const worker = new PyodideWorker()
worker.onmessage = ({ data }: { data: WorkerResponse }) => {
  if (data.kind == 'print') {
    for (let chunk of data.data) {
      let arr = new Uint8Array(chunk)
      terminal_output += decoder.decode(arr)
    }
    outputEl.innerHTML = ansi_converter.toHtml(escapeHTML(terminal_output))
    // scrolls to the bottom of the div
    outputEl.scrollIntoView(false)
  } else {
    statusEl.innerText = data.message
  }
}

function workerMessage(data: RunCode) {
  worker.postMessage(data)
}

statusEl.innerText = 'Starting Python…'
workerMessage({ user_code: null })

async function loadEditor() {
  // const monaco = await import('monaco-editor')
  const { monaco } = await import('./monaco-editor-python')
  monaco.editor.defineTheme('custom-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1f2e',
    },
  })

  const url = new URL(window.location.href)
  const base64Code = url.searchParams.get('code')

  document.querySelectorAll('.loading').forEach((el) => {
    ;(el as HTMLElement).style.display = 'none'
  })

  const editor = monaco.editor.create(document.getElementById('editor')!, {
    value: base64Code ? atob(base64Code) : defaultPythonCode,
    language: 'python',
    theme: 'custom-dark',
    automaticLayout: true,
    minimap: {
      enabled: false,
    },
  })

  function run() {
    terminal_output = ''
    statusEl.innerText = 'Running Python…'
    worker.postMessage({ user_code: editor.getValue() })
  }

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)

  document.getElementById('run')!.addEventListener('click', run)
}

loadEditor()
