import { Accessor, Setter } from 'solid-js'
import type { File } from './types'

interface TabProps {
  getActiveContent: () => string
  setActiveContent: (content: string) => void
  files: Accessor<File[]>
  setFiles: Setter<File[]>
  save: (files: File[], verbose?: boolean) => void
}

export default function ({ getActiveContent, setActiveContent, files, setFiles, save }: TabProps) {
  function newTab() {
    const activeContent = getActiveContent()
    const newFileName = getNewName(files())
    if (newFileName) {
      const file: File = { name: newFileName, content: '', active: false }
      setFiles((prev) => [...(prev || []), file])
      changeTab(activeContent, newFileName)
    }
  }

  function changeTab(activeContent: string, newName: string) {
    const files = setFiles((prev) =>
      prev.map(({ name, content, active }) => {
        if (name == newName) {
          setActiveContent(content)
          return { name, content, active: true }
        } else if (active) {
          return { name, content: activeContent, active: false }
        } else {
          return { name, content, active }
        }
      }),
    )
    save(files)
  }

  function closeTab(event: MouseEvent, name: string) {
    event.stopPropagation()
    const files = setFiles((prev) => {
      if (prev.length === 1) {
        return prev
      }
      const files = prev.filter((f) => f.name !== name)
      if (!files.find((f) => f.active)) {
        files[0].active = true
        setActiveContent(files[0].content)
      }
      return files
    })
    save(files)
  }

  return (
    <div class="tabs">
      {files().map(({ name, active }) => (
        <div class={active ? 'tab active' : 'tab'} onClick={() => changeTab(getActiveContent(), name)}>
          {name}
          <span class="close" onClick={(e) => closeTab(e, name)}>
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

function getNewName(files: File[]): string | null {
  let defaultName: string = 'new.py'
  let num = 1
  while (files.find((f) => f.name === defaultName)) {
    defaultName = `new-${num}.py`
    num++
  }

  let name = prompt('File name?', defaultName)
  while (name !== null && files.find((f) => f.name === name)) {
    name = prompt(`File name ${name} already exists. Try another name?`, defaultName)
  }
  return name
}
