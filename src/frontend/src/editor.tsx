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
  const [showSave, setShowSave] = createSignal(false)
  const [showFork, setShowFork] = createSignal(false)
  const [disableFork, setDisableFork] = createSignal(false)
  const [files, setFiles] = createSignal<File[]>([])
  const [fadeOut, setFadeOut] = createSignal(false)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null
  const editorEl = (<div class="editor" />) as HTMLElement
  let statusTimeout: number
  let clearSaveTimeout: number
  let clearForkTimeout: number

  onMount(async () => {
    const [{ monaco }, { files, allowSave, allowFork }] = await Promise.all([import('./monacoEditor'), retrieve()])
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1f2e',
      },
    })

    const active = findActive(files)
    const file = files.find((f) => f.activeIndex === active)
    editor = monaco.editor.create(editorEl, {
      value: file ? file.content : '',
      language: 'python',
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: {
        enabled: false,
      },
    })

    setFiles(files)
    setShowSave(allowSave)
    setShowFork(allowFork)
    runCode(files, true)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save(updateFiles(getActiveContent()), true))
    editor.onDidChangeModelContent(() => {
      clearTimeout(clearSaveTimeout)
      clearSaveTimeout = setTimeout(() => save(updateFiles(getActiveContent())), 1200)
    })
  })

  async function save(files: File[], verbose: boolean = false, fork: boolean = false) {
    if (!saveActive()) {
      return
    }
    let result = null
    try {
      result = await store(files, fork)
    } catch (err) {
      setFadeOut(false)
      clearInterval(statusTimeout)
      setSaveStatus(`Failed to save, ${err}`)
      return
    }
    setShowSave(true)
    setShowFork(true)
    if (verbose && result === null) {
      result = { message: 'Up to date', newProject: false }
    } else if (result === null) {
      return
    }
    setFadeOut(false)
    setSaveStatus(result.message)
    clearInterval(statusTimeout)
    statusTimeout = setTimeout(() => setFadeOut(true), 4000)
    if (result.newProject) {
      setDisableFork(true)
      clearTimeout(clearForkTimeout)
      clearForkTimeout = setTimeout(() => setDisableFork(false), 10000)
    }
  }

  function updateFiles(activeContent: string): File[] {
    return setFiles((prev) => {
      const active = findActive(prev)
      return prev.map(({ name, content, activeIndex }) => {
        return { name, content: activeIndex == active ? activeContent : content, activeIndex }
      })
    })
  }

  function run() {
    const files = updateFiles(getActiveContent())
    runCode(files)
    save(files)
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
      save(updateFiles(getActiveContent()), true)
    }
  }

  function fork() {
    setSaveActive(true)
    save(updateFiles(getActiveContent()), true, true)
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
    <div class="col pb-10">
      <Show when={files().length} fallback={<div class="loading">loading...</div>}>
        <Tabs files={files()} addFile={addFile} changeFile={changeFile} closeFile={closeFile} />
        {editorEl}
        <footer>
          <div>
            <span class={fadeOut() ? 'middle status fade fadeout' : 'middle status fade'}>{saveStatus()}</span>
          </div>
          <div class="flex">
            {showSave() && (
              <div class="toggle" title="Save changes to on pydantic.run's infra">
                <span class="middle">Save</span>
                <label class="switch">
                  <input
                    type="checkbox"
                    checked={saveActive()}
                    onChange={(e) => toggleSave(e.currentTarget.checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            )}
            {showFork() && (
              <div>
                <button
                  class="blue"
                  disabled={disableFork()}
                  onClick={fork}
                  title={disableFork() ? 'Forking temporarily disabled' : 'Save these files under a new URL'}
                >
                  Fork
                </button>
              </div>
            )}
            <div>
              <button class="green" onClick={run} title="Run code in your browser and display the output">
                Run
              </button>
            </div>
          </div>
        </footer>
      </Show>
    </div>
  )
}
