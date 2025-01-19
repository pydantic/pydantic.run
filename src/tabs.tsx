import { Accessor, Setter } from 'solid-js'
import type { File } from './types'

interface TabProps {
  getActiveContent: () => string
  setActiveContent: (content: string) => void
  files: Accessor<File[] | null>
  setFiles: Setter<File[] | null>
}

export default function ({ files, setFiles, getActiveContent, setActiveContent }: TabProps) {
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
    setFiles((prev) =>
      (prev || []).map(({ name, content, active }) => {
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
  }

  function closeTab(name: string) {
    setFiles((prev) => {
      if (prev === null || prev.length === 1) {
        return prev
      }
      const files = prev.filter((f) => f.name !== name)
      if (!files.find((f) => f.active)) {
        files[0].active = true
        setActiveContent(files[0].content)
      }
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
