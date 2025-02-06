export const MAX_FILE_SIZE = 1024 * 10

export async function api(url: URL, request: Request, env: Env): Promise<Response> {
  const { pathname, searchParams } = url
  const readKey = pathname.split('/')[3]
  if (request.method === 'GET') {
    return await get(readKey, env)
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const contentType = request.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    return new Response('Invalid content type', { status: 400 })
  }
  // check body size
  const body = await request.blob()
  if (body.size > MAX_FILE_SIZE) {
    return new Response('Invalid body, 10kB limit exceeded', { status: 413 })
  }

  if (readKey === 'new') {
    return await storeNew(body, env)
  } else {
    return await storeExisting(body, readKey, searchParams, env)
  }
}

async function get(readKey: string, env: Env): Promise<Response> {
  const object = await env.BUCKET.get(filesPath(readKey))
  if (object === null) {
    return new Response('Sandbox not found', { status: 404 })
  } else {
    return new Response(object.body, { headers: { 'content-type': 'application/json' } })
  }
}

async function storeNew(body: Blob, env: Env): Promise<Response> {
  const readKey = generateHex(16)
  const writeKey = generateHex(32)
  await Promise.all([env.BUCKET.put(filesPath(readKey), body), env.BUCKET.put(writeKeyPath(readKey), writeKey)])
  const response = {
    readKey,
    writeKey,
  }
  return new Response(JSON.stringify(response), {
    status: 201,
    headers: {
      'content-type': 'application/json',
    },
  })
}

async function storeExisting(body: Blob, readKey: string, search: URLSearchParams, env: Env): Promise<Response> {
  const writeKey = search.get('writeKey')
  if (!writeKey) {
    return new Response('Unauthorized - no writeKey', { status: 401 })
  }
  const object = await env.BUCKET.get(writeKeyPath(readKey))
  if (!object) {
    return new Response('Unauthorized - wrong writeKey (none found)', { status: 403 })
  }
  const realWriteKey = await object.text()
  if (realWriteKey !== writeKey) {
    return new Response('Unauthorized - wrong writeKey', { status: 403 })
  }

  await env.BUCKET.put(filesPath(readKey), body)
  return new Response('ok')
}

export const filesPath = (readKey: string) => `${readKey}/files`
const writeKeyPath = (readKey: string) => `${readKey}/writeKey`

export function generateHex(length: number): string {
  const size = Math.ceil(length / 2)
  const array = new Uint8Array(size)
  crypto.getRandomValues(array)
  return toHexString(array).substring(0, length)
}

export const toHexString = (array: Uint8Array) =>
  Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
