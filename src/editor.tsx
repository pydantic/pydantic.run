import { createSignal, onMount, Show } from 'solid-js'

import type * as monaco from 'monaco-editor'

interface EditorProps {
  runCode: (user_code: string) => void
  initialCode: string
}

export default function ({ runCode, initialCode }: EditorProps) {
  let [loading, setLoading] = createSignal(true)
  let editor: monaco.editor.IStandaloneCodeEditor
  let editorRef!: HTMLDivElement

  function run() {
    runCode(editor!.getValue())
  }

  onMount(async () => {
    console.log('loading editor')
    // const monaco = await import('monaco-editor')
    const { monaco } = await import('./monacoEditor')
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1f2e',
      },
    })

    setLoading(false)

    editor = monaco.editor.create(editorRef, {
      value: initialCode,
      language: 'python',
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: {
        enabled: false,
      },
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)
  })

  return (
    <div class="col">
      <div class="editor" ref={editorRef}>
        <Show when={loading()}>
          <div class="loading">loading...</div>
        </Show>
      </div>
      <div class="right">
        {loading()}
        <button onClick={run}>Run</button>
      </div>
    </div>
  )
}
