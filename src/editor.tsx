import { onMount, createSignal, Show } from 'solid-js'

import type * as monaco from 'monaco-editor'
import type { File } from './types'
import { retrieve, store } from './store.ts'
import Tabs from './tabs'

interface EditorProps {
  runCode: (files: File[], warmup?: boolean) => void
}

export default function ({ runCode }: EditorProps) {
  const [saveActive, setSaveActive] = createSignal(false)
  const [saveStatus, setSaveStatus] = createSignal('Changes not saved')
  const [files, setFiles] = createSignal<File[] | null>(null)
  const [fadeOut, setFadeOut] = createSignal(false)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null
  const editorEl = (<div class="editor"></div>) as HTMLElement
  let statusTimeout: number

  onMount(async () => {
    const [{ monaco }, initialFiles] = await Promise.all([import('./monacoEditor'), retrieve()])
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1f2e',
      },
    })

    let activeContent = getContent(initialFiles) || ''
    editor = monaco.editor.create(editorEl, {
      value: activeContent,
      language: 'python',
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: {
        enabled: false,
      },
    })

    setFiles(initialFiles)
    runCode(initialFiles, true)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      await save(updateFiles(getActiveContent()), true)
    })

    setInterval(() => {
      const newActiveContent = getActiveContent()
      if (newActiveContent !== activeContent) {
        activeContent = newActiveContent
        save(updateFiles(activeContent))
      }
    }, 5000)
  })

  async function save(files: File[], verbose: boolean = false) {
    if (!saveActive()) {
      return
    }
    let msg: string | null = null
    try {
      msg = await store(files)
    } catch (err) {
      setFadeOut(false)
      clearInterval(statusTimeout)
      setSaveStatus(`Failed to save: ${err}`)
      return
    }
    if (verbose && msg === null) {
      msg = 'Up to date'
    } else if (msg === null) {
      return
    }
    setFadeOut(false)
    setSaveStatus(msg)
    clearInterval(statusTimeout)
    statusTimeout = setTimeout(() => setFadeOut(true), 2000)
  }

  function updateFiles(activeContent: string): File[] {
    return setFiles((prev) =>
      (prev || []).map(({ name, content, active }) => ({ name, content: active ? activeContent : content, active })),
    )
  }

  async function run() {
    const files = updateFiles(getActiveContent())
    runCode(files)
    await save(files)
  }

  function getActiveContent(): string {
    return editor!.getValue()
  }

  function setActiveContent(content: string) {
    if (editor) {
      editor.setValue(content)
    }
  }

  async function toggleSave(enabled: boolean) {
    setSaveActive(enabled)
    if (enabled) {
      await save(updateFiles(getActiveContent()), true)
    }
  }

  return (
    <div class="col">
      <Show when={files() !== null} fallback={<div class="loading">loading...</div>}>
        <Tabs
          getActiveContent={getActiveContent}
          setActiveContent={setActiveContent}
          files={files}
          setFiles={setFiles}
        />
        {editorEl}
        <footer>
          <div>
            <span class={fadeOut() ? 'middle status fade fadeout' : 'middle status fade'}>{saveStatus()}</span>
          </div>
          <div class="flex">
            <div class="toggle">
              <span class="middle">Save</span>
              <label class="switch">
                <input type="checkbox" checked={saveActive()} onChange={(e) => toggleSave(e.currentTarget.checked)} />
                <span class="slider"></span>
              </label>
            </div>
            <div>
              <button class="run" onClick={run}>
                Run
              </button>
            </div>
          </div>
        </footer>
      </Show>
    </div>
  )
}

function getContent(files: File[] | null): string | null {
  const file = files ? files.find((f) => f.active) : undefined
  return file ? file.content : null
}
