export interface RunCode {
  user_code: string
  warmup?: boolean
}

export interface Print {
  kind: 'print'
  data: ArrayBuffer[]
}

export interface Error {
  kind: 'error'
  message: string
}

export interface Installed {
  kind: 'installed'
  installed: string[]
}

export interface Status {
  kind: 'status'
  message: string
}

export type WorkerResponse = Print | Error | Installed | Status
