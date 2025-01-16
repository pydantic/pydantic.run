monaco.editor.defineTheme('custom-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
        'editor.background': '#1e1f2e'
    }
});

const url = new URL(window.location);
const base64Code = url.searchParams.get('code');

const defaultCode = `\
import logfire

logfire.configure()
logfire.info('Hello, {place}!', place='World')
`

window.editor = monaco.editor.create(document.getElementById('editor'), {
  value: base64Code ? atob(base64Code) : defaultCode,
  language: 'python',
  theme: 'custom-dark',
  minimap: {
    enabled: false
  }
});

const output_el = document.getElementById('output');
const decoder = new TextDecoder();
const Convert = require('ansi-to-html');
const ansi_converter = new Convert();
let terminal_output = '';

const query_args = new URLSearchParams(location.search);
query_args.set('ts', Date.now());
const worker = new Worker(`./worker.js?${query_args.toString()}`);
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

document.getElementById('run').addEventListener('click', () => {
  terminal_output = '';
  output_el.innerHTML = '';
  worker.postMessage({userCode: editor.getValue()});
});
