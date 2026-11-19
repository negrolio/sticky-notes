import { useCallback, useEffect, useRef, useState } from 'react'

export type BackgroundColor = '#ECEFF1' | '#FFFFFF' | '#EFE6D8' | '#DCE5DA' | '#DDE7F0' | '#B0BEC5'

/** The board background (decision 25): a UI preference, not note data. */
export type Background = { kind: 'color'; color: BackgroundColor } | { kind: 'image'; blob: Blob }

export const BACKGROUND_COLORS: readonly { readonly name: string; readonly color: BackgroundColor }[] = [
  { name: 'Default', color: '#ECEFF1' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Sand', color: '#EFE6D8' },
  { name: 'Sage', color: '#DCE5DA' },
  { name: 'Sky', color: '#DDE7F0' },
  { name: 'Slate', color: '#B0BEC5' },
]

export const DEFAULT_BACKGROUND: Background = { kind: 'color', color: '#ECEFF1' }
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const BACKGROUND_DB = 'sticky-notes-ui'
export const BACKGROUND_STORE = 'settings'
export const BACKGROUND_KEY = 'background'

export interface BackgroundStore {
  /** The stored background, or null when none is stored. Rejects when the stored value is invalid. */
  load(): Promise<Background | null>
  save(background: Background): Promise<void>
}

/** Whether a picked file may become the background: an image of at most MAX_IMAGE_BYTES. */
export function isUsableImage(file: File): boolean {
  return file.type.startsWith('image/') && file.size <= MAX_IMAGE_BYTES
}

/** The value as a background, or null if it is not one. */
export function toBackground(value: unknown): Background | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null
  if (value.kind === 'image') {
    return 'blob' in value && value.blob instanceof Blob ? { kind: 'image', blob: value.blob } : null
  }
  if (value.kind !== 'color' || !('color' in value)) return null
  const color = BACKGROUND_COLORS.find((c) => c.color === value.color)?.color
  return color === undefined ? null : { kind: 'color', color }
}

function parseStored(value: unknown): Background | null {
  if (value === undefined) return null
  const background = toBackground(value)
  if (!background) throw new Error('Invalid stored background')
  return background
}

/** Keeps the value in memory, as is. For tests, and the default when no store is given. */
export function createMemoryBackgroundStore(): BackgroundStore {
  let stored: unknown = undefined
  return {
    load() {
      return new Promise((resolve) => {
        resolve(parseStored(stored))
      })
    },
    save(background) {
      stored = background
      return Promise.resolve()
    },
  }
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    }
  })
}

/**
 * Keeps the background in IndexedDB, which stores Blobs natively. `factory` defaults to
 * `window.indexedDB`, read on each call, so a browser without it fails a call, not the module load.
 */
export function createIndexedDbBackgroundStore(factory: () => IDBFactory = () => window.indexedDB): BackgroundStore {
  const open = async (): Promise<IDBDatabase> => {
    const request = factory().open(BACKGROUND_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(BACKGROUND_STORE)
    }
    return settled(request)
  }

  return {
    async load() {
      const db = await open()
      try {
        const value: unknown = await settled(db.transaction(BACKGROUND_STORE, 'readonly').objectStore(BACKGROUND_STORE).get(BACKGROUND_KEY))
        return parseStored(value)
      } finally {
        db.close()
      }
    },
    async save(background) {
      const db = await open()
      try {
        const transaction = db.transaction(BACKGROUND_STORE, 'readwrite')
        const done = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => {
            resolve()
          }
          transaction.onerror = transaction.onabort = () => {
            reject(transaction.error ?? new Error('IndexedDB transaction failed'))
          }
        })
        transaction.objectStore(BACKGROUND_STORE).put(background, BACKGROUND_KEY)
        await done
      } finally {
        db.close()
      }
    },
  }
}

/**
 * The board background, loaded from `store` and saved on each change. The default shows until the
 * load lands; a change made before then wins. A failed or invalid load, and failed saves, each warn
 * once and leave the background in use for the session.
 */
export function useBackground(store: BackgroundStore) {
  const [background, setBackgroundState] = useState<Background>(DEFAULT_BACKGROUND)
  const changed = useRef(false)
  const saveWarned = useRef(false)

  useEffect(() => {
    let active = true
    // Wrapped, so a store that throws instead of rejecting is handled the same way.
    new Promise<Background | null>((resolve) => {
      resolve(store.load())
    }).then(
      (stored) => {
        if (active && stored && !changed.current) setBackgroundState(stored)
      },
      (error: unknown) => {
        if (active) console.warn('Using the default background', error)
      },
    )
    return () => {
      active = false
    }
  }, [store])

  const setBackground = useCallback(
    (next: Background) => {
      changed.current = true
      setBackgroundState(next)
      new Promise<void>((resolve) => {
        resolve(store.save(next))
      }).catch((error: unknown) => {
        if (saveWarned.current) return
        saveWarned.current = true
        console.warn('Failed to save the background; it is kept for this session', error)
      })
    },
    [store],
  )

  return { background, setBackground }
}

/** An object URL for the blob, revoked when the blob changes or on unmount. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(blob)
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
    }
  }, [blob])

  return url
}
