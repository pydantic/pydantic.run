export interface CodeFile {
  name: string
  content: string
  // highest activeIndex value is the active tab
  activeIndex: number
}

export interface RunCode {
  serverSide: boolean
  files: CodeFile[]
}

export interface Print {
  kind: 'print'
  data: Uint8Array[]
}
export interface Message {
  kind: 'status' | 'error' | 'installed'
  message: string
}
export interface Versions {
  kind: 'versions'
  python: string
  pyodide: string
}

export type WorkerResponse = Print | Message | Versions
