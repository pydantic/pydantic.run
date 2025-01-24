import { z } from 'zod'

import { filesPath, toHexString, MAX_FILE_SIZE } from './api'

export async function createNew(url: URL, request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const filesParam = url.searchParams.get('files')
  if (!filesParam) {
    return new Response('No "files" found in in URL parameters', { status: 400 })
  }
  const hash = await hashString(filesParam)
  const readKey = hash.substring(0, 16)
  const existing = await env.BUCKET.head(filesPath(readKey))
  if (!existing) {
    const result = parseFiles(filesParam)
    if (result instanceof Response) {
      return result
    }
    await env.BUCKET.put(filesPath(readKey), JSON.stringify({ files: result }))
  }
  return Response.redirect(`${url.origin}/store/${readKey}`, 302)
}

const filesSchema = z.array(
  z.object({
    name: z.string(),
    content: z.string(),
    activeIndex: z.number().default(0),
  }),
)

interface File {
  name: string
  content: string
  // highest activeIndex value is the active tab
  activeIndex: number
}

function parseFiles(filesParam: string): Response | File[] {
  if (filesParam.length > MAX_FILE_SIZE) {
    return new Response('Invalid body, 10kB limit exceeded', { status: 413 })
  }
  let rawFiles
  try {
    rawFiles = JSON.parse(filesParam)
  } catch (e) {
    return new Response(`Invalid JSON in "files": ${e}`, { status: 400 })
  }
  let files: File[]
  try {
    files = filesSchema.parse(rawFiles)
  } catch (e) {
    return new Response(`Invalid "files": ${e}`, { status: 400 })
  }
  if (files.length === 0) {
    return new Response('No files found', { status: 400 })
  }
  if (files.every((f) => f.activeIndex === 0)) {
    files[0].activeIndex = 1
  }
  return files
}

const encoder = new TextEncoder()

async function hashString(message: string): Promise<string> {
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return toHexString(new Uint8Array(hashBuffer))
}
