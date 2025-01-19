import { Accessor, Setter } from 'solid-js'
import type { File } from './types'

interface TabProps {
  getActiveContent: () => string
  setActiveContent: (content: string) => void
  files: Accessor<File[]>
  setFiles: Setter<File[]>
  save: (files: File[], verbose?: boolean) => void
}

export function Tabs({ getActiveContent, setActiveContent, files, setFiles, save }: TabProps) {
  function newTab() {
    const activeContent = getActiveContent()
    const newFileName = getNewName(files())
    if (newFileName) {
      // set active to 0, for new file, it'll be set by changeTab
      const file: File = { name: newFileName, content: '', activeIndex: 0 }
      setFiles((prev) => [...prev, file])
      changeTab(activeContent, newFileName)
    }
  }

  function changeTab(activeContent: string, newName: string) {
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
    save(files)
  }

  function closeTab(event: MouseEvent, name: string) {
    event.stopPropagation()
    const files = setFiles((prev) => {
      if (prev.length === 1) {
        return prev
      } else {
        return prev.filter((f) => f.name !== name)
      }
    })
    save(files)
  }

  return (
    <div class="tabs">
      {tabs(files()).map(({ name, active }) => (
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

interface Tab {
  name: string
  active: boolean
}

function tabs(files: File[]): Tab[] {
  const active = findActive(files)
  return files.map(({ name, activeIndex }) => ({ name, active: activeIndex === active }))
}

function getNewName(files: File[]): string | null {
  let defaultName: string = 'new.py'
  let num = 1
  while (files.find((f) => f.name === defaultName)) {
    defaultName = `new_${num}.py`
    num++
  }

  let name = prompt('File name?', defaultName)
  while (name !== null && files.find((f) => f.name === name)) {
    name = prompt(`File name ${name} already exists. Try another name?`, defaultName)
  }
  return name
}

export const findActive = (files: File[]): number =>
  files.reduce((acc, { activeIndex }) => Math.max(acc, activeIndex), 0)
