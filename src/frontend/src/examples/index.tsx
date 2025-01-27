import { CodeFile } from '../types'
import helloWorldExample from './hello_world.py?raw'
import logfireExample from './logfire_example.py?raw'
import pydanticExample from './pydantic_example.py?raw'

export function Examples() {
  return (
    <div class="examples">
      {EXAMPLES.map(({ path, name }) => (
        <a href={path}>{name}</a>
      ))}
    </div>
  )
}

export function getExample(path: string): CodeFile[] {
  const urlExample = EXAMPLES.find((e) => e.path === path)
  if (urlExample) {
    return urlExample.files
  } else {
    return HELLO_WORLD_FILES
  }
}

interface Example {
  path: string
  name: string
  files: CodeFile[]
}

const HELLO_WORLD_FILES: CodeFile[] = [
  {
    name: 'main.py',
    content: helloWorldExample,
    activeIndex: 0,
  },
]

const EXAMPLES: Example[] = [
  {
    path: '/blank',
    name: 'Blank',
    files: [
      {
        name: 'main.py',
        content: '',
        activeIndex: 0,
      },
    ],
  },
  {
    path: '/hello-world',
    name: 'Hello world',
    files: HELLO_WORLD_FILES,
  },
  {
    path: '/logfire',
    name: 'Logfire',
    files: [
      {
        name: 'main.py',
        content: logfireExample,
        activeIndex: 0,
      },
    ],
  },
  {
    path: '/pydantic',
    name: 'Pydantic',
    files: [
      {
        name: 'main.py',
        content: pydanticExample,
        activeIndex: 0,
      },
    ],
  },
]
