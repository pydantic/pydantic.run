import { api } from './api'

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return await api(request, env)
    } else if (url.pathname.startsWith('/store/')) {
      url.pathname = '/'
      return await env.ASSETS.fetch(url, request)
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
