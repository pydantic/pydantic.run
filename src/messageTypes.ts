export interface RunCode {
  user_code: string | null
}

export interface Print {
  kind: 'print'
  data: ArrayBuffer[]
}

export interface Status {
  kind: 'status'
  message: string
}

export type WorkerResponse = Print | Status
