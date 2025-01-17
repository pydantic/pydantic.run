import './style.css'

import Convert from 'ansi-to-html'

import PyodideWorker from './worker?worker'
import defaultPythonCode from './default_code.py?raw'

async function load() {
  const outputEl = document.getElementById('output')!
  const decoder = new TextDecoder()
  const ansi_converter = new Convert()
  let terminal_output = ''

  const worker = new PyodideWorker()
  worker.onmessage = ({ data }) => {
    if (typeof data == 'string') {
      terminal_output += data
    } else {
      for (let chunk of data) {
        let arr = new Uint8Array(chunk)
        let extra = decoder.decode(arr)
        terminal_output += extra
      }
    }
    outputEl.innerHTML = ansi_converter.toHtml(terminal_output)
    // scrolls to the bottom of the div
    outputEl.scrollIntoView(false)
  }
  worker.postMessage('')

  const monaco = await import('monaco-editor')
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

  document.getElementById('run')!.addEventListener('click', () => {
    terminal_output = ''
    outputEl.innerHTML = 'running python...'
    worker.postMessage(editor.getValue())
  })
}

load()
