import { api } from './api'
import { createNew } from './new'

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.host === 'sandbox.pydantic.run') {
      const proxyUrl = new URL(env.SANDBOX)
      proxyUrl.pathname = url.pathname
      proxyUrl.search = url.search
      return await fetch(proxyUrl, request)
    } else if (url.pathname.startsWith('/api/')) {
      return await api(url, request, env)
    } else if (url.pathname === '/new' || url.pathname === '/new/') {
      return await createNew(url, request, env)
    } else if (url.pathname.startsWith('/store/') || url.pathname.startsWith('/blank')) {
      url.pathname = '/'
      return await env.ASSETS.fetch(url, request)
    } else if (url.pathname.startsWith('/info')) {
      const git_sha = env.GITHUB_SHA ? env.GITHUB_SHA.substring(0, 7) : 'dev'
      return new Response(`Release version ${git_sha}`)
    } else if (url.pathname == '/sandbox/run/') {
      const proxyUrl = new URL(env.SANDBOX)
      proxyUrl.pathname = '/run/'
      return await fetch(proxyUrl, request)
    } else {
      const r = await env.ASSETS.fetch(request)
      if (r.status == 404) {
        // default is empty, add some details
        return new Response('404: Page Not Found', { status: 404 })
      } else {
        return r
      }
    }
  },
} satisfies ExportedHandler<Env>
