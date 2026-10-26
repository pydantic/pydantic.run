// GITHUB_SHA is only set on deploy (`--var GITHUB_SHA:...`), so it's not in wrangler.toml or the generated types
declare namespace Cloudflare {
  interface Env {
    GITHUB_SHA?: string
  }
}

interface Env {
  GITHUB_SHA?: string
}
