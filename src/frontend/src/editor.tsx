import { onMount, createSignal, Show } from 'solid-js'

import type * as monaco from 'monaco-editor'
import type { File } from './types'
import { retrieve, store } from './store.ts'
import { Tabs, findActive } from './tabs'

interface EditorProps {
  runCode: (files: File[], warmup?: boolean) => void
}

export default function ({ runCode }: EditorProps) {
  const [saveActive, setSaveActive] = createSignal(false)
  const [saveStatus, setSaveStatus] = createSignal('Changes not saved')
  const [files, setFiles] = createSignal<File[]>([])
  const [fadeOut, setFadeOut] = createSignal(false)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null
  const editorEl = (<div class="editor" />) as HTMLElement
  let statusTimeout: number
  let clearSaveTimeout: number

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

    const active = findActive(initialFiles)
    const file = initialFiles.find((f) => f.activeIndex === active)
    editor = monaco.editor.create(editorEl, {
      value: file ? file.content : '',
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save(updateFiles(getActiveContent()), true))
    editor.onDidChangeModelContent(() => {
      clearTimeout(clearSaveTimeout)
      clearSaveTimeout = setTimeout(() => save(updateFiles(getActiveContent())), 1000)
    })
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
      setSaveStatus(`Failed to save, ${err}`)
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
    return setFiles((prev) => {
      const active = findActive(prev)
      return prev.map(({ name, content, activeIndex }) => {
        return { name, content: activeIndex == active ? activeContent : content, activeIndex }
      })
    })
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

  function toggleSave(enabled: boolean) {
    setSaveActive(enabled)
    if (enabled) {
      // noinspection JSIgnoredPromiseFromCall
      save(updateFiles(getActiveContent()), true)
    }
  }

  function addFile(name: string) {
    // set active to 0, for new file, it'll be set by changeTab
    const file: File = { name, content: '', activeIndex: 0 }
    setFiles((prev) => [...prev, file])
    changeFile(name)
    editor!.focus()
  }

  function changeFile(newName: string) {
    const activeContent = getActiveContent()
    const files = setFiles((prev) => {
      const active = findActive(prev)
      return prev.map(({ name, content, activeIndex }) => {
        if (name == newName) {
          setActiveContent(content)
          return { name, content, activeIndex: active + 1 }
        } else if (activeIndex === active) {
          return { name, content: activeContent, activeIndex }
        } else {
          return { name, content, activeIndex }
        }
      })
    })
    // noinspection JSIgnoredPromiseFromCall
    save(files)
    editor!.focus()
  }

  function closeFile(name: string) {
    const files = setFiles((prev) => {
      if (prev.length === 1) {
        return prev
      } else {
        return prev.filter((f) => f.name !== name)
      }
    })
    // noinspection JSIgnoredPromiseFromCall
    save(files)
    editor!.focus()
  }

  return (
    <div class="col">
      <Show when={files().length} fallback={<div class="loading">loading...</div>}>
        <Tabs files={files()} addFile={addFile} changeFile={changeFile} closeFile={closeFile} />
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
