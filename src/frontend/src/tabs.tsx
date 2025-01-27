import type { CodeFile } from './types'

interface TabProps {
  files: CodeFile[]
  addFile: (name: string) => void
  changeFile: (name: string) => void
  closeFile: (name: string) => void
}

export function Tabs(props: TabProps) {
  function newTab() {
    const newFileName = getNewName(props.files)
    if (newFileName) {
      props.addFile(newFileName)
    }
  }

  function closeTab(event: MouseEvent, name: string) {
    event.stopPropagation()
    props.closeFile(name)
  }

  return (
    <div class="tabs">
      {tabs(props.files).map(({ name, active }) => (
        <div class={active ? 'tab active' : 'tab'} onClick={() => props.changeFile(name)}>
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

function tabs(files: CodeFile[]): Tab[] {
  const active = findActive(files)
  return files.map(({ name, activeIndex }) => ({ name, active: activeIndex === active }))
}

function getNewName(files: CodeFile[]): string | null {
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

export const findActive = (files: CodeFile[]): number =>
  files.reduce((acc, { activeIndex }) => Math.max(acc, activeIndex), 0)
