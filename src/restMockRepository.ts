import { createLocalStorageRepository, parseNotes, toNote } from './localStorageRepository.ts'
import { MOCK_LATENCY_MS } from './model.ts'
import type { NotesRepository } from './repository.ts'

export const REST_STORAGE_KEY = 'sticky-notes-rest'

interface RestMockOptions {
  /** The share of calls, from 0 to 1, that fail. */
  failRate?: number
  /** Draws decide, per call, first whether it fails and then its latency. Injectable for tests. */
  random?: () => number
}

type Method = 'GET' | 'PUT' | 'DELETE'

class MockServerError extends Error {}

/**
 * The fake server: a JSON API over notes kept in localStorage under its own key, so a reload
 * behaves like a server that kept its data. GET /notes, PUT /notes/:id, DELETE /notes/:id.
 */
function createServer() {
  const storage = createLocalStorageRepository(undefined, REST_STORAGE_KEY)
  const noteId = (path: string) => decodeURIComponent(path.slice('/notes/'.length))

  return async (method: Method, path: string, body?: string): Promise<string> => {
    if (method === 'GET' && path === '/notes') return JSON.stringify(await storage.load())
    if (method === 'PUT' && path.startsWith('/notes/')) {
      const note = toNote(JSON.parse(body ?? 'null'))
      if (!note || note.id !== noteId(path)) throw new MockServerError(`400 ${method} ${path}`)
      await storage.upsert(note)
      return ''
    }
    if (method === 'DELETE' && path.startsWith('/notes/')) {
      await storage.remove(noteId(path))
      return ''
    }
    throw new MockServerError(`404 ${method} ${path}`)
  }
}

/**
 * The async REST mock (decision 5). A request reaches the server at once, so requests apply in the
 * order they are sent and a slow write never lands after a newer one. Only the response is late,
 * by 200-600 ms. A failed request changes nothing.
 */
export function createRestMockRepository({ failRate = 0, random = Math.random }: RestMockOptions = {}): NotesRepository {
  const server = createServer()

  const request = (method: Method, path: string, body?: string): Promise<string> => {
    const fails = random() < failRate
    // Whole milliseconds from min to max, both included.
    const latency = MOCK_LATENCY_MS.min + Math.floor(random() * (MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min + 1))
    const response = fails
      ? Promise.resolve<{ error: unknown } | { body: string }>({ error: new MockServerError(`500 ${method} ${path}`) })
      : server(method, path, body).then(
          (ok) => ({ body: ok }),
          (error: unknown) => ({ error }),
        )
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        void response.then((outcome) => {
          if ('body' in outcome) resolve(outcome.body)
          else reject(outcome.error instanceof Error ? outcome.error : new MockServerError(String(outcome.error)))
        })
      }, latency)
    })
  }

  return {
    async load() {
      const notes = parseNotes(await request('GET', '/notes'))
      if (!notes) throw new MockServerError('Invalid response to GET /notes')
      return notes
    },
    async upsert(note) {
      await request('PUT', `/notes/${encodeURIComponent(note.id)}`, JSON.stringify(note))
    },
    async remove(id) {
      await request('DELETE', `/notes/${encodeURIComponent(id)}`)
    },
  }
}
