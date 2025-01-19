export interface Env {
  BUCKET: R2Bucket
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const { url, method } = request
  const { pathname, searchParams } = new URL(url)
  const readKey = pathname.split('/')[3]
  const isNew = readKey === 'new'
  console.log({ pathname, readKey, isNew })
  if (!isNew && method === 'GET') {
    return await get(readKey, env)
  }

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const contentType = request.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    return new Response('Invalid content type', { status: 400 })
  }
  // check body size
  const body = await request.blob()
  if (body.size > 1024 * 10) {
    return new Response('File too large', { status: 413 })
  }

  if (isNew) {
    return await storeNew(body, env)
  } else {
    return await storeExisting(body, readKey, searchParams, env)
  }
}

async function get(readKey: string, env: Env): Promise<Response> {
  let object = await env.BUCKET.get(`${readKey}/files`)
  return new Response(object.body, { headers: { 'content-type': 'application/json' } })
}

async function storeNew(body: Blob, env: Env): Promise<Response> {
  const readKey = generateHex(16)
  const writeKey = generateHex(32)
  await env.BUCKET.put(`${readKey}/files`, body)
  await env.BUCKET.put(`${readKey}/writeKey`, writeKey)
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
  const object = await env.BUCKET.get(`${readKey}/writeKey`)
  const realWriteKey = await object.text()
  if (realWriteKey !== writeKey) {
    return new Response('Unauthorized - wrong writeKey', { status: 401 })
  }

  await env.BUCKET.put(`${readKey}/files`, body)
  return new Response('ok')
}

export function generateHex(length: number): string {
  const size = Math.ceil(length / 2)
  const array = new Uint8Array(size)
  crypto.getRandomValues(array)
  return toHexString(array).substring(0, length)
}

const toHexString = (array: Uint8Array) => Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
