import type { CodeFile } from './types'
import { getExample } from './examples'

interface StoreHttpResponse {
  readKey: string
  writeKey: string
}

interface StoreResult {
  message: string
  newProject: boolean
}

export async function store(files: CodeFile[] | null, fork: boolean = false): Promise<StoreResult | null> {
  const readKey = getReadKey(location.pathname)
  const body = JSON.stringify({ files })
  let url = '/api/store/new'
  let writeKey: string | null = null
  if (readKey) {
    writeKey = localStorage.getItem(getWriteKey(readKey))
    if (writeKey && !fork) {
      url = `/api/store/${readKey}?writeKey=${writeKey}`
      const lastSave = localStorage.getItem(getContentKey(readKey))
      if (lastSave && lastSave == body) {
        console.debug('skipping save, no changes')
        return null
      }
    }
  }
  console.debug(writeKey ? 'saving changes' : 'creating new project')

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  })
  if (!r.ok) {
    const response_text = await r.text()
    console.warn({ status: r.status, response_text })
    throw new Error(`${r.status}: Failed to store files.`)
  }
  if (readKey && writeKey && !fork) {
    localStorage.setItem(getContentKey(readKey), body)
    return { message: 'Changes saved', newProject: false }
  } else {
    const data: StoreHttpResponse = await r.json()
    localStorage.setItem(getContentKey(data.readKey), body)
    const path = `/store/${data.readKey}`
    localStorage.setItem(getWriteKey(data.readKey), data.writeKey)
    history.pushState({}, '', path)
    return { message: 'New project created', newProject: true }
  }
}

const getWriteKey = (readKey: string) => `getWriteKey:${readKey}`

interface InitialState {
  files: CodeFile[]
  allowSave: boolean
  allowFork: boolean
}

export async function retrieve(): Promise<InitialState> {
  const { pathname } = location
  if (pathname.startsWith('/store/')) {
    const readKey = getReadKey(pathname)
    if (readKey) {
      const files = await retrieveStored(readKey)
      if (files) {
        const writeKey = localStorage.getItem(getWriteKey(readKey))
        return {
          files,
          allowSave: !!writeKey,
          allowFork: true,
        }
      }
    }
  }
  return {
    files: getExample(pathname),
    allowSave: true,
    allowFork: false,
  }
}

async function retrieveStored(readKey: string): Promise<CodeFile[] | null> {
  const r = await fetch(`/api/store/${readKey}`)
  if (r.status == 404) {
    return null
  }
  if (!r.ok) {
    const response_text = await r.text()
    console.warn({ status: r.status, response_text })
    throw new Error(`${r.status}: Failed to retrieve stored files.`)
  }
  const { files } = await r.json()
  return files as CodeFile[]
}

const getReadKey = (path: string): string | null => path.split('/')[2] || null
const getContentKey = (readKey: string) => `content:${readKey}`
