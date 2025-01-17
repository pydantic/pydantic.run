import './style.css'

import * as monaco from 'monaco-editor'
import Convert from 'ansi-to-html'

import PyodideWorker from './worker?worker'

const DEFAULT_CODE = `\
# /// script
# dependencies = ["logfire"]
# ///

import logfire

logfire.configure()
logfire.info('Hello, {place}!', place='World')
`

declare global {
    interface Window { editor: monaco.editor.IStandaloneCodeEditor; }
}

function load() {
  monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
          'editor.background': '#1e1f2e'
      }
  });

  const url = new URL(window.location.href);
  const base64Code = url.searchParams.get('code');

  const editor = getElementByID('editor');

  window.editor = monaco.editor.create(editor, {
    value: base64Code ? atob(base64Code) : DEFAULT_CODE,
    language: 'python',
    theme: 'custom-dark',
    automaticLayout: true,
    minimap: {
      enabled: false
    }
  });

  const output_el = getElementByID('output');
  const decoder = new TextDecoder();
  const ansi_converter = new Convert();
  let terminal_output = '';

  const query_args = new URLSearchParams(location.search);
  query_args.set('ts', Date.now().toString());
  const worker = new PyodideWorker();
  worker.onmessage = ({data}) => {
    if (typeof data == 'string') {
      terminal_output += data;
    } else {
      for (let chunk of data) {
        let arr = new Uint8Array(chunk);
        let extra = decoder.decode(arr);
        terminal_output += extra;
      }
    }
    output_el.innerHTML = ansi_converter.toHtml(terminal_output);
    // scrolls to the bottom of the div
    output_el.scrollIntoView(false);
  };
  worker.postMessage({userCode: ''});

  getElementByID('run').addEventListener('click', () => {
    terminal_output = '';
    output_el.innerHTML = '';
    worker.postMessage({userCode: window.editor.getValue()});
  });
}

function getElementByID(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el) {
    return el;
  } else {
    throw new Error(`${el} element not found`);
  }
}

load()

