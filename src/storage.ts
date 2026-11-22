import type { Mix } from './mixer.ts'

export interface Clip {
  rate: number
  channels: Float32Array[]
}

export interface Slice {
  start: number
  end: number
}

export interface Track {
  steps: boolean[]
  muted: boolean
  sample: Clip | null
}

export type Instrument = 'piano' | 'guitar' | 'bass'

export interface Note {
  instrument: Instrument
  pitch: number
  step: number
  length: number
}

export interface Session {
  bpm: number
  tracks: Track[]
  recording: Clip | null
  name: string
  slices: Slice[]
  selected: number
  bars?: Note[][]
  mix?: Mix
}

const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('lets-cook-a-music', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('sessions')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export async function load(): Promise<Session | undefined> {
  const db = await database
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function save(session: Session): Promise<void> {
  const db = await database
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite')
    transaction.objectStore('sessions').put(session, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
