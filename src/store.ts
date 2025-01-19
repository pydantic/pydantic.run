import type { File } from './types'

import defaultPythonCode from './default_code.py?raw'

interface StoreResponse {
  readKey: string
  writeKey: string
}

export async function store(files: File[] | null) {
  const { pathname } = location
  const readKey = getReadKey(pathname)
  const writeKey = localStorage.getItem(getWriteKey(readKey))
  const url = writeKey ? `/api/store/${readKey}?writeKey=${writeKey}` : '/api/store/new'
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files }),
  })
  if (!r.ok) {
    const response_text = await r.text()
    console.warn({ status: r.status, response_text })
    throw new Error(`${r.status}: Failed to store files.`)
  }
  if (!writeKey) {
    const data: StoreResponse = await r.json()
    const path = `/store/${data.readKey}`
    localStorage.setItem(getWriteKey(data.readKey), data.writeKey)
    history.pushState({}, '', path)
  }
}

const getWriteKey = (readKey: string) => `getWriteKey:${readKey}`

export async function retrieve(): Promise<File[]> {
  const { searchParams, pathname } = new URL(window.location.href)
  if (pathname.startsWith('/store/')) {
    const f = await retrieveStored(pathname)
    if (f) {
      return f
    }
  }
  const base64Code = searchParams.get('code')
  const content = base64Code ? atob(base64Code) : defaultPythonCode
  return [{ name: 'main.py', content, active: true }]
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

const getReadKey = (path: string) => path.split('/')[2]
