export interface File {
  name: string
  content: string
  active: boolean
}

export interface RunCode {
  files: File[]
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
