export interface CodeFile {
  name: string
  content: string
  // highest activeIndex value is the active tab
  activeIndex: number
}

export interface RunCode {
  files: CodeFile[]
}

export interface Print {
  kind: 'print'
  data: ArrayBuffer[]
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
export interface EndRun {
  kind: 'end'
}

export type WorkerResponse = Print | Message | Versions | EndRun
