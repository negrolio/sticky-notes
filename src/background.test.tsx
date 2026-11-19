import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import {
  BACKGROUND_COLORS,
  BACKGROUND_DB,
  BACKGROUND_KEY,
  BACKGROUND_STORE,
  createIndexedDbBackgroundStore,
  createMemoryBackgroundStore,
  MAX_IMAGE_BYTES,
  type BackgroundStore,
} from './background.ts'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { createRestMockRepository } from './restMockRepository.ts'
import { installPointerStubs } from './test/pointer.ts'

const IMAGE_ERROR = "Couldn't use that image."
let urls: string[] = []
let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>

beforeEach(() => {
  installPointerStubs()
  localStorage.clear()
  urls = []
  // jsdom has no object URLs.
  createObjectURL = vi.fn((blob: Blob) => {
    expect(blob).toBeInstanceOf(Blob)
    const url = `blob:test/${String(urls.length + 1)}`
    urls.push(url)
    return url
  })
  revokeObjectURL = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now())
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }

function spied(store: BackgroundStore) {
  const save = vi.fn((value: Parameters<BackgroundStore['save']>[0]) => store.save(value))
  return { ...store, save }
}

async function renderApp(
  backgroundStore: BackgroundStore,
  stored: NotesRepository = createMemoryRepository([a]),
) {
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const remove = vi.fn((id: string) => stored.remove(id))
  const load = vi.fn(() => stored.load())
  const repository: NotesRepository = { load, upsert, remove }
  render(<App repository={repository} backgroundStore={backgroundStore} />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  // Lets the background load land.
  await act(async () => {
    await Promise.resolve()
  })
  return { main, upsert, remove, load }
}

function backgroundButton(): HTMLElement {
  return within(screen.getByRole('toolbar', { name: 'Board tools' })).getByRole('button', { name: 'Change background' })
}

function popover(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Board background' })
}

function openPopover(): HTMLElement {
  fireEvent.click(backgroundButton())
  const open = popover()
  if (!open) throw new Error('the background popover did not open')
  return open
}

function choose(name: string) {
  fireEvent.click(within(openPopover()).getByRole('button', { name }))
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('no file input')
  return input
}

function upload(file: File) {
  const open = popover() ?? openPopover()
  const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => {})
  fireEvent.click(within(open).getByRole('button', { name: 'Upload image' }))
  expect(click).toHaveBeenCalledTimes(1)
  fireEvent.change(fileInput(), { target: { files: [file] } })
}

function image(type = 'image/png', size?: number): File {
  const file = new File(['png'], 'picture.png', { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

function shown(main: HTMLElement) {
  const { backgroundColor, backgroundImage, backgroundSize, backgroundPosition, backgroundAttachment } = main.style
  return { backgroundColor, backgroundImage, backgroundSize, backgroundPosition, backgroundAttachment }
}

const DEFAULT_SHOWN = {
  backgroundColor: 'rgb(236, 239, 241)',
  backgroundImage: '',
  backgroundSize: '',
  backgroundPosition: '',
  backgroundAttachment: '',
}

function imageShown(url: string) {
  return {
    backgroundColor: 'rgb(236, 239, 241)',
    backgroundImage: `url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }
}

function status(): HTMLElement {
  return screen.getByRole('status')
}

describe('AC 73: the background popover', () => {
  test('"Change background" opens a dialog with 6 named swatches and "Upload image"', async () => {
    const { main } = await renderApp(createMemoryBackgroundStore())
    expect(backgroundButton().title).toBe('Change background')
    expect(backgroundButton().getAttribute('aria-haspopup')).toBe('dialog')
    expect(shown(main)).toEqual(DEFAULT_SHOWN)
    const open = openPopover()

    expect(main.contains(open)).toBe(false)
    const names = within(open)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual(['Default', 'White', 'Sand', 'Sage', 'Sky', 'Slate', 'Upload image'])
    expect(BACKGROUND_COLORS.map((c) => c.color)).toEqual(['#ECEFF1', '#FFFFFF', '#EFE6D8', '#DCE5DA', '#DDE7F0', '#B0BEC5'])
    expect(within(open).getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(open).getByRole('button', { name: 'Sky' }).getAttribute('aria-pressed')).toBe('false')
    expect(fileInput().accept).toBe('image/*')
  })

  test('it follows the color popover rules: Escape and a click outside close it, the button toggles it', async () => {
    await renderApp(createMemoryBackgroundStore())
    openPopover()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(popover()).toBeNull()
    openPopover()
    fireEvent.pointerDown(screen.getByRole('main'))
    expect(popover()).toBeNull()
    openPopover()
    fireEvent.click(backgroundButton())
    expect(popover()).toBeNull()
  })

  test('only one popover is open at a time', async () => {
    await renderApp(createMemoryBackgroundStore())
    const group = screen.getByRole('group')
    fireEvent.click(within(group).getByRole('button', { name: 'Change font' }))
    openPopover()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(within(group).getByRole('button', { name: 'Change color' }))
    expect(popover()).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  test('AC 64: its button follows "Delete all notes" in Tab order', async () => {
    await renderApp(createMemoryBackgroundStore())
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete all notes', 'Change background'])
  })
})

describe('AC 74: a swatch', () => {
  test('sets the board color, closes the popover, and is kept after a reload', async () => {
    const store = spied(createMemoryBackgroundStore())
    const { main } = await renderApp(store)
    choose('Sage')
    expect(shown(main)).toEqual({ ...DEFAULT_SHOWN, backgroundColor: 'rgb(220, 229, 218)' })
    expect(popover()).toBeNull()
    expect(store.save).toHaveBeenCalledWith({ kind: 'color', color: '#DCE5DA' })

    cleanup()
    const reloaded = await renderApp(store)
    expect(shown(reloaded.main).backgroundColor).toBe('rgb(220, 229, 218)')
    expect(within(openPopover()).getByRole('button', { name: 'Sage' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('AC 75: an uploaded image', () => {
  test('is shown with cover, centred and fixed, and kept after a reload', async () => {
    const store = spied(createMemoryBackgroundStore())
    const { main } = await renderApp(store)
    const file = image()
    upload(file)

    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(shown(main)).toEqual(imageShown('blob:test/1'))
    expect(store.save).toHaveBeenCalledWith({ kind: 'image', blob: file })
    expect(popover()).toBeNull()

    cleanup()
    const reloaded = await renderApp(store)
    expect(shown(reloaded.main)).toEqual(imageShown('blob:test/2'))
    expect(createObjectURL).toHaveBeenLastCalledWith(file)
  })

  test('"Remove image" shows only while an image is set, and no swatch is pressed then', async () => {
    await renderApp(createMemoryBackgroundStore())
    expect(within(openPopover()).queryByRole('button', { name: 'Remove image' })).toBeNull()
    upload(image())
    const open = openPopover()
    expect(within(open).getByRole('button', { name: 'Remove image' })).toBeTruthy()
    expect(within(open).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})

describe('AC 76: a rejected file', () => {
  test.each([
    ['not an image', image('text/plain')],
    ['larger than 10 MB', image('image/png', MAX_IMAGE_BYTES + 1)],
  ])('a file that is %s shows the toast and leaves the background unchanged', async (_name, file) => {
    const store = spied(createMemoryBackgroundStore())
    const { main } = await renderApp(store)
    choose('Sky')
    store.save.mockClear()
    upload(file)

    expect(within(status()).getByText(IMAGE_ERROR)).toBeTruthy()
    expect(shown(main)).toEqual({ ...DEFAULT_SHOWN, backgroundColor: 'rgb(221, 231, 240)' })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
  })

  test('exactly 10 MB is accepted', async () => {
    const { main } = await renderApp(createMemoryBackgroundStore())
    upload(image('image/jpeg', MAX_IMAGE_BYTES))
    expect(shown(main).backgroundImage).toBe('url("blob:test/1")')
    expect(within(status()).queryByText(IMAGE_ERROR)).toBeNull()
  })
})

describe('AC 77: leaving an image', () => {
  test.each([
    [
      'selecting a swatch',
      () => {
        choose('White')
      },
      'rgb(255, 255, 255)',
    ],
    [
      'clicking "Remove image"',
      () => fireEvent.click(within(openPopover()).getByRole('button', { name: 'Remove image' })),
      'rgb(236, 239, 241)',
    ],
  ])('%s drops the image and revokes its object URL', async (_name, leave, color) => {
    const store = spied(createMemoryBackgroundStore())
    const { main } = await renderApp(store)
    upload(image())
    expect(revokeObjectURL).not.toHaveBeenCalled()
    leave()

    expect(shown(main)).toEqual({ ...DEFAULT_SHOWN, backgroundColor: color })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
    expect(store.save).toHaveBeenLastCalledWith({ kind: 'color', color: color === 'rgb(255, 255, 255)' ? '#FFFFFF' : '#ECEFF1' })
  })

  test('replacing an image revokes the old URL, and unmounting revokes the current one', async () => {
    await renderApp(createMemoryBackgroundStore())
    upload(image())
    upload(image('image/gif'))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:test/2')
    cleanup()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/2')
  })
})

describe('AC 78: independent of the notes backend', () => {
  test('with ?backend=rest a background change makes no mock call and is kept after a reload', async () => {
    const store = createMemoryBackgroundStore()
    const rest = () => createRestMockRepository({ random: () => 0 })
    const first = await renderApp(store, rest())
    first.load.mockClear()
    choose('Slate')
    upload(image())
    expect(first.load).not.toHaveBeenCalled()
    expect(first.upsert).not.toHaveBeenCalled()
    expect(first.remove).not.toHaveBeenCalled()

    cleanup()
    const reloaded = await renderApp(store, rest())
    expect(shown(reloaded.main).backgroundImage).toBe('url("blob:test/2")')
  })
})

/**
 * A minimal in-memory IndexedDB: one database with object stores of key-value pairs, and requests
 * that settle asynchronously as the real ones do. Only what the background store uses.
 */
function fakeIndexedDb(databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>()) {
  const later = (callback: () => void) => {
    setTimeout(callback, 0)
  }
  const factory = {
    open(name: string) {
      const request: Record<string, unknown> & {
        onupgradeneeded?: () => void
        onsuccess?: () => void
        onerror?: () => void
      } = {}
      later(() => {
        const isNew = !databases.has(name)
        const stores = databases.get(name) ?? new Map<string, Map<IDBValidKey, unknown>>()
        databases.set(name, stores)
        const transaction = (storeName: string) => {
          const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
            objectStore: () => {
              const store = stores.get(storeName)
              if (!store) throw new Error(`no store ${storeName}`)
              const settle = (run: () => unknown) => {
                const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {}
                later(() => {
                  req.result = run()
                  req.onsuccess?.()
                  later(() => tx.oncomplete?.())
                })
                return req
              }
              return {
                get: (key: IDBValidKey) => settle(() => store.get(key)),
                put: (value: unknown, key: IDBValidKey) =>
                  settle(() => {
                    store.set(key, value)
                    return key
                  }),
              }
            },
          }
          return tx
        }
        request.result = {
          createObjectStore: (storeName: string) => stores.set(storeName, new Map()),
          transaction,
          close: () => {},
        }
        if (isNew) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
  // A DOM boundary: the fake implements only the part of IDBFactory the store calls.
  return { factory: factory as unknown as IDBFactory, databases }
}

describe('the IndexedDB store', () => {
  test('saves under sticky-notes-ui / settings / background, with the Blob as is, and loads it back', async () => {
    const { factory, databases } = fakeIndexedDb()
    const store = createIndexedDbBackgroundStore(() => factory)
    const file = image()
    await store.save({ kind: 'image', blob: file })
    expect(BACKGROUND_DB).toBe('sticky-notes-ui')
    expect(BACKGROUND_STORE).toBe('settings')
    expect(BACKGROUND_KEY).toBe('background')
    expect(databases.get('sticky-notes-ui')?.get('settings')?.get('background')).toEqual({ kind: 'image', blob: file })
    expect(await store.load()).toEqual({ kind: 'image', blob: file })
    await store.save({ kind: 'color', color: '#EFE6D8' })
    expect(await createIndexedDbBackgroundStore(() => factory).load()).toEqual({ kind: 'color', color: '#EFE6D8' })
  })

  test('nothing stored loads as null', async () => {
    const { factory } = fakeIndexedDb()
    expect(await createIndexedDbBackgroundStore(() => factory).load()).toBeNull()
  })
})

describe('AC 79: failures', () => {
  test.each([
    ['an unknown color', { kind: 'color', color: '#123456' }],
    ['an unknown kind', { kind: 'pattern' }],
    ['an image without a Blob', { kind: 'image', blob: 'data:' }],
    ['not an object', 'blue'],
  ])('a stored value with %s gives the default background and one warning', async (_name, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const databases = new Map([['sticky-notes-ui', new Map([['settings', new Map<IDBValidKey, unknown>([['background', value]])]])]])
    const { factory } = fakeIndexedDb(databases)
    const { main } = await renderApp(createIndexedDbBackgroundStore(() => factory))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(shown(main)).toEqual(DEFAULT_SHOWN)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  test('IndexedDB missing gives the default background and one warning, and a change still applies', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // jsdom has no indexedDB, as a browser that blocks it.
    const { main } = await renderApp(createIndexedDbBackgroundStore())
    expect(shown(main)).toEqual(DEFAULT_SHOWN)
    expect(warn).toHaveBeenCalledTimes(1)
    choose('Sand')
    expect(shown(main).backgroundColor).toBe('rgb(239, 230, 216)')
  })

  test('an IndexedDB that fails to open gives the default background and one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failingOpen = {
      open() {
        const request: { error: Error; onerror?: () => void } = { error: new Error('blocked') }
        setTimeout(() => request.onerror?.(), 0)
        return request
      },
    }
    // A DOM boundary: the fake implements only the open call the store makes.
    const store = createIndexedDbBackgroundStore(() => failingOpen as unknown as IDBFactory)
    await expect(store.save({ kind: 'color', color: '#FFFFFF' })).rejects.toThrow('blocked')
    const { main } = await renderApp(store)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(shown(main)).toEqual(DEFAULT_SHOWN)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('a failing save keeps the background for the session and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing: BackgroundStore = {
      load: () => Promise.resolve(null),
      save: () => Promise.reject(new Error('quota')),
    }
    const { main } = await renderApp(failing)
    choose('Sand')
    choose('Sky')
    await act(async () => {
      await Promise.resolve()
    })
    expect(shown(main).backgroundColor).toBe('rgb(221, 231, 240)')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('until the load lands the default shows, and a change made before it wins', async () => {
    let land: (value: null) => void = () => {}
    const slow: BackgroundStore = {
      load: () => new Promise((resolve) => (land = resolve)),
      save: () => Promise.resolve(),
    }
    const store = createMemoryBackgroundStore()
    await store.save({ kind: 'color', color: '#FFFFFF' })
    const late: BackgroundStore = { load: () => slow.load().then(() => store.load()), save: (value) => slow.save(value) }
    const { main } = await renderApp(late)
    expect(shown(main)).toEqual(DEFAULT_SHOWN)
    choose('Slate')
    await act(async () => {
      land(null)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(shown(main).backgroundColor).toBe('rgb(176, 190, 197)')
  })
})
