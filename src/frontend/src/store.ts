import type { File } from './types'

import defaultPythonCode from './default_code.py?raw'

interface StoreResponse {
  readKey: string
  writeKey: string
}

export async function store(files: File[] | null): Promise<string | null> {
  const readKey = getReadKey(location.pathname)
  const body = JSON.stringify({ files })
  let url = '/api/store/new'
  let writeKey: string | null = null
  if (readKey) {
    writeKey = localStorage.getItem(getWriteKey(readKey))
    if (writeKey) {
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
  if (readKey && writeKey) {
    localStorage.setItem(getContentKey(readKey), body)
    return 'Changes saved'
  } else {
    const data: StoreResponse = await r.json()
    localStorage.setItem(getContentKey(data.readKey), body)
    const path = `/store/${data.readKey}`
    localStorage.setItem(getWriteKey(data.readKey), data.writeKey)
    history.pushState({}, '', path)
    return 'New project created'
  }
}

const getWriteKey = (readKey: string) => `getWriteKey:${readKey}`

export async function retrieve(): Promise<File[]> {
  if (location.pathname.startsWith('/store/')) {
    const f = await retrieveStored(location.pathname)
    if (f) {
      return f
    }
  }
  return [{ name: 'main.py', content: defaultPythonCode, activeIndex: 0 }]
}

async function retrieveStored(path: string): Promise<File[] | null> {
  const readKey = getReadKey(path)
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
  return files as File[]
}

const getReadKey = (path: string): string | null => path.split('/')[2] || null
const getContentKey = (readKey: string) => `content:${readKey}`
