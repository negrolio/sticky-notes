import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createLocalStorageRepository, STORAGE_KEY } from './localStorageRepository.ts'
import { MAX_TEXT_LENGTH, type Note } from './model.ts'

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }
const b: Note = { id: 'b', x: 400, y: 300, width: 120, height: 90, text: 'second', color: '#B3E5FC', z: 2 }

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('localStorage repository', () => {
  test('loads an empty board when nothing is stored', async () => {
    expect(await createLocalStorageRepository().load()).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  test('what is written survives a new repository, as after a reload', async () => {
    const first = createLocalStorageRepository()
    await first.upsert(a)
    await first.upsert(b)
    await first.upsert({ ...a, x: 150 })
    await first.remove('b')
    expect(await createLocalStorageRepository().load()).toEqual([{ ...a, x: 150 }])
  })

  test('writes at once, inside the call, so a write on page hide is not lost', () => {
    void createLocalStorageRepository().upsert(a)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([a])
  })

  test('callers cannot mutate what is stored', async () => {
    const repository = createLocalStorageRepository()
    const note = { ...a }
    await repository.upsert(note)
    note.x = 999
    const [loaded] = await repository.load()
    if (!loaded) throw new Error('nothing loaded')
    loaded.y = 999
    expect(await repository.load()).toEqual([a])
  })

  test('removing an unknown id changes nothing', async () => {
    const repository = createLocalStorageRepository()
    await repository.upsert(a)
    await repository.remove('nope')
    expect(await repository.load()).toEqual([a])
  })

  test('a storage failure rejects the call', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(createLocalStorageRepository().upsert(a)).rejects.toThrow('full')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    await expect(createLocalStorageRepository().load()).rejects.toThrow('denied')
  })
})

describe('AC 42: invalid stored data', () => {
  test.each([
    ['invalid JSON', '{not json'],
    ['not an array', JSON.stringify({ notes: [a] })],
    ['a note missing a field', JSON.stringify([a, { ...b, z: undefined }])],
    ['a field of the wrong type', JSON.stringify([{ ...a, x: '100' }])],
    ['a color outside the palette', JSON.stringify([{ ...a, color: '#000000' }])],
    ['text over the cap', JSON.stringify([{ ...a, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }])],
    ['a duplicate id', JSON.stringify([a, { ...b, id: 'a' }])],
    ['an empty id', JSON.stringify([{ ...a, id: '' }])],
    ['a size below the minimum', JSON.stringify([{ ...a, width: 79 }])],
    ['a negative size', JSON.stringify([{ ...a, height: -5 }])],
    ['null', 'null'],
  ])('%s: the board starts empty, with one warning', async (_, raw) => {
    localStorage.setItem(STORAGE_KEY, raw)
    expect(await createLocalStorageRepository().load()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('loading the same invalid data again does not warn again, as when StrictMode loads twice', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const repository = createLocalStorageRepository()
    await repository.load()
    await repository.load()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('the next write replaces the invalid data, without another warning', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const repository = createLocalStorageRepository()
    await repository.load()
    await repository.upsert(a)
    expect(await repository.load()).toEqual([a])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
