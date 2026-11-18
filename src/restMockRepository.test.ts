import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createRestMockRepository, REST_STORAGE_KEY } from './restMockRepository.ts'
import { STORAGE_KEY } from './localStorageRepository.ts'
import { MOCK_LATENCY_MS, type Note } from './model.ts'

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }
const b: Note = { id: 'b', x: 400, y: 300, width: 120, height: 90, text: 'second', color: '#B3E5FC', z: 2 }

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A random source that returns the given values in turn, then repeats the last one. */
function sequence(...values: number[]) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)] ?? 0
}

/** Whether the promise has settled after `ms` of mock time. */
async function settledAfter(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false
  promise.then(
    () => (settled = true),
    () => (settled = true),
  )
  await vi.advanceTimersByTimeAsync(ms)
  return settled
}

describe('AC 38: latency', () => {
  test.each([
    ['load', (r: ReturnType<typeof createRestMockRepository>) => r.load()],
    ['upsert', (r: ReturnType<typeof createRestMockRepository>) => r.upsert(a)],
    ['remove', (r: ReturnType<typeof createRestMockRepository>) => r.remove('a')],
  ])('%s resolves asynchronously, after 200-600 ms', async (_, call) => {
    // The latency comes from the second random draw; the first decides failure.
    const fastest = call(createRestMockRepository({ random: sequence(0.99, 0) }))
    expect(await settledAfter(fastest, MOCK_LATENCY_MS.min - 1)).toBe(false)
    expect(await settledAfter(fastest, 1)).toBe(true)

    const slowest = call(createRestMockRepository({ random: sequence(0.99, 0.9999) }))
    expect(await settledAfter(slowest, MOCK_LATENCY_MS.max - 1)).toBe(false)
    expect(await settledAfter(slowest, 1)).toBe(true)
  })

  test('with the default random source, every call settles within 200-600 ms', async () => {
    const repository = createRestMockRepository()
    for (let i = 0; i < 20; i++) {
      const call = repository.upsert({ ...a, x: i })
      expect(await settledAfter(call, MOCK_LATENCY_MS.min - 1)).toBe(false)
      expect(await settledAfter(call, MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min + 1)).toBe(true)
    }
  })
})

describe('AC 37: storage', () => {
  test('what is written survives a new repository, as after a reload, under its own key', async () => {
    const first = createRestMockRepository()
    void first.upsert(a)
    void first.upsert(b)
    void first.upsert({ ...a, x: 150 })
    void first.remove('b')
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)

    const loading = createRestMockRepository().load()
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    expect(await loading).toEqual([{ ...a, x: 150 }])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(REST_STORAGE_KEY)).not.toBeNull()
  })

  test('requests apply in the order they are sent, whatever their latency', async () => {
    // Draws alternate: failure, latency. The first write is slow, the second fast.
    const repository = createRestMockRepository({ random: sequence(0.99, 0.99, 0.99, 0) })
    void repository.upsert({ ...a, text: 'old' })
    void repository.upsert({ ...a, text: 'new' })
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)

    const loading = createRestMockRepository().load()
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    expect(await loading).toEqual([{ ...a, text: 'new' }])
  })

  test('callers cannot mutate what is stored', async () => {
    const repository = createRestMockRepository()
    const note = { ...a }
    void repository.upsert(note)
    note.x = 999
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    const loading = repository.load()
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    expect(await loading).toEqual([a])
  })
})

describe('failure rate', () => {
  test('with a rate of 1, every call rejects after its latency and nothing is stored', async () => {
    const repository = createRestMockRepository({ failRate: 1 })
    const upsert = repository.upsert(a)
    const load = repository.load()
    const remove = repository.remove('a')
    for (const call of [upsert, load, remove]) call.catch(() => {})
    expect(await settledAfter(upsert, MOCK_LATENCY_MS.min - 1)).toBe(false)
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)

    await expect(upsert).rejects.toThrow()
    await expect(load).rejects.toThrow()
    await expect(remove).rejects.toThrow()
    expect(localStorage.getItem(REST_STORAGE_KEY)).toBeNull()
  })

  test('a call fails when its draw is below the rate', async () => {
    const repository = createRestMockRepository({ failRate: 0.5, random: sequence(0.49, 0, 0.5, 0, 0.5, 0) })
    const failed = repository.upsert(a)
    failed.catch(() => {})
    const succeeded = repository.upsert(b)
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    await expect(failed).rejects.toThrow()
    await expect(succeeded).resolves.toBeUndefined()

    const loading = repository.load()
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    expect(await loading).toEqual([b])
  })

  test('with a rate of 0, no call fails', async () => {
    const repository = createRestMockRepository({ failRate: 0, random: sequence(0, 0) })
    const call = repository.upsert(a)
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    await expect(call).resolves.toBeUndefined()
  })
})
