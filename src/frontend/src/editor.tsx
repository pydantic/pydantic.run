import { onMount, createSignal, Show } from 'solid-js'

import type { CodeFile } from './types'
import { retrieve, store } from './store.ts'
import { Tabs, findActive } from './tabs'
import type { Editor } from './monacoEditor'

interface EditorProps {
  runCode: (files: CodeFile[]) => void
  running: boolean
}

export default function (props: EditorProps) {
  const [saveActive, setSaveActive] = createSignal(false)
  const [saveStatus, setSaveStatus] = createSignal('Changes not saved')
  const [showSave, setShowSave] = createSignal(false)
  const [showFork, setShowFork] = createSignal(false)
  const [disableFork, setDisableFork] = createSignal(false)
  const [files, setFiles] = createSignal<CodeFile[]>([])
  const [fadeOut, setFadeOut] = createSignal(false)
  let editor: Editor | null = null
  const editorEl = (<div class="editor" />) as HTMLElement
  let statusTimeout: number
  let clearSaveTimeout: number
  let clearForkTimeout: number

  onMount(async () => {
    const [{ Editor, KeyMod, KeyCode }, { files, allowSave, allowFork }] = await Promise.all([
      import('./monacoEditor'),
      retrieve(),
    ])

    const active = findActive(files)
    const file = files.find((f) => f.activeIndex === active)
    editor = new Editor(editorEl, file)

    setFiles(files)
    setShowSave(allowSave)
    setShowFork(allowFork)

    const searchParams = new URLSearchParams(location.search)
    const tab = searchParams.get('tab')
    if (tab && files.find((f) => f.name === tab)) {
      changeFile(tab)
    }

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, run)
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => save(updateFiles(editor!.getValue()), true))
    editor.onDidChangeModelContent(() => {
      clearTimeout(clearSaveTimeout)
      clearSaveTimeout = setTimeout(() => save(updateFiles(editor!.getValue())), 1200)
    })
  })

  async function save(files: CodeFile[], verbose: boolean = false, fork: boolean = false) {
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
      result = { message: 'Up to date', newSandbox: false }
    } else if (result === null) {
      return
    }
    setFadeOut(false)
    setSaveStatus(result.message)
    clearInterval(statusTimeout)
    statusTimeout = setTimeout(() => setFadeOut(true), 4000)
    if (result.newSandbox) {
      setDisableFork(true)
      clearTimeout(clearForkTimeout)
      clearForkTimeout = setTimeout(() => setDisableFork(false), 10000)
    }
  }

  function updateFiles(activeContent: string): CodeFile[] {
    return setFiles((prev) => {
      const active = findActive(prev)
      return prev.map(({ name, content, activeIndex }) => {
        return { name, content: activeIndex == active ? activeContent : content, activeIndex }
      })
    })
  }

  function run() {
    const files = updateFiles(editor!.getValue())
    props.runCode(files)
    save(files)
  }

  function toggleSave(enabled: boolean) {
    setSaveActive(enabled)
    if (enabled) {
      save(updateFiles(editor!.getValue()), true)
    }
  }

  function fork() {
    setSaveActive(true)
    save(updateFiles(editor!.getValue()), true, true)
  }

  function addFile(name: string) {
    // set active to 0, for new file, it'll be set by changeTab
    const file: CodeFile = { name, content: '', activeIndex: 0 }
    setFiles((prev) => [...prev, file])
    changeFile(name)
    editor!.focus()
  }

  function changeFile(newName: string) {
    const activeContent = editor!.getValue()
    const files = setFiles((prev) => {
      const active = findActive(prev)
      return prev.map(({ name, content, activeIndex }) => {
        if (name == newName) {
          const newFile = { name, content, activeIndex: active + 1 }
          editor!.setFile(newFile)
          return newFile
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
              <button
                class="green"
                onClick={run}
                disabled={props.running}
                title="Run code in your browser and display the output"
              >
                Run
              </button>
            </div>
          </div>
        </footer>
      </Show>
    </div>
  )
}
