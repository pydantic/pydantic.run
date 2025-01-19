import { onMount, createSignal, createEffect, Accessor, Setter, Show } from 'solid-js'

import type * as monaco from 'monaco-editor'
import type { File } from './types'

interface EditorProps {
  runCode: (code: string) => void
  files: Accessor<File[] | null>
  setFiles: Setter<File[] | null>
  save: Accessor<boolean>
  setSave: Setter<boolean>
}

export default function (props: EditorProps) {
  const { runCode, files, save, setSave } = props
  const [loading, setLoading] = createSignal(true)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null
  let editorRef!: HTMLDivElement

  function run() {
    runCode(editor!.getValue())
  }

  onMount(async () => {
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
      value: getContent(files()),
      language: 'python',
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: {
        enabled: false,
      },
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)
  })

  createEffect(() => {
    const newContent = getContent(files())
    if (editor) {
      editor.setValue(newContent)
    }
  })

  function getActiveContent(): string {
    return editor!.getValue()
  }

  return (
    <div class="col">
      <Tabs getActiveContent={getActiveContent} {...props} />
      <div class="editor" ref={editorRef}>
        <Show when={loading()}>
          <div class="loading">loading...</div>
        </Show>
      </div>
      <footer>
        <div class="toggle">
          <span class="name">Save</span>
          <label class="switch">
            <input type="checkbox" checked={save()} onChange={(e) => setSave(e.currentTarget.checked)} />
            <span class="slider"></span>
          </label>
        </div>
        <div>
          <button class="run" onClick={run}>
            Run
          </button>
        </div>
      </footer>
    </div>
  )
}

interface TabProps extends EditorProps {
  getActiveContent: () => string
}

function Tabs({ files, setFiles, getActiveContent }: TabProps) {
  function changeTab(updateContent: string, newName: string) {
    setFiles((prev) =>
      (prev || []).map(({ name, content, active }) => {
        if (name == newName) {
          return { name, content, active: true }
        } else if (active) {
          return { name, content: updateContent, active: false }
        } else {
          return { name, content, active }
        }
      }),
    )
  }

  function newTab() {
    const activeContent = getActiveContent()
    const newFileName = getNewName(files())
    if (newFileName) {
      const file: File = { name: newFileName, content: '', active: false }
      setFiles((prev) => [...(prev || []), file])
      changeTab(activeContent, newFileName)
    }
  }

  function closeTab(name: string) {
    setFiles((prev) => {
      if (prev === null || prev.length === 1) {
        return prev
      }
      const files = prev.filter((f) => f.name !== name)
      if (!files.find((f) => f.active)) {
        files[0].active = true
      }
      console.log(files)
      return files
    })
  }

  return (
    <div class="tabs">
      {(files() || []).map(({ name, active }) => (
        <div class={active ? 'tab active' : 'tab'} onClick={() => changeTab(getActiveContent(), name)}>
          {name}
          <span class="close" onClick={() => closeTab(name)}>
            ✕
          </span>
        </div>
      ))}
      <div class="tab new" onClick={newTab}>
        +
      </div>
    </div>
  )
}

function getContent(files: File[] | null) {
  const file = (files || []).find((f) => f.active)
  return file ? file.content : ''
}

function getNewName(files: File[] | null): string | null {
  let defaultName: string = 'new.py'
  let num = 1
  while (files && files.find((f) => f.name === defaultName)) {
    defaultName = `new-${num}.py`
    num++
  }

  let name = prompt('File name?', defaultName)
  while (name !== null && files && files.find((f) => f.name === name)) {
    name = prompt(`File name ${name} already exists. Try another name?`, defaultName)
  }
  return name
}
