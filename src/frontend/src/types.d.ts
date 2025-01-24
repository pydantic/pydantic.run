export interface File {
  name: string
  content: string
  // highest activeIndex value is the active tab
  activeIndex: number
}

export interface RunCode {
  files: File[]
  warmup?: boolean
}

export interface Print {
  kind: 'print'
  data: ArrayBuffer[]
}
export interface Message {
  kind: 'status' | 'error' | 'versions' | 'installed'
  message: string
}

export type WorkerResponse = Print | Message
