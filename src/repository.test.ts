import { describe, expect, test } from 'vitest'
import type { Note } from './model.ts'
import { createMemoryRepository } from './repository.ts'

const note: Note = {
  id: 'a',
  x: 10,
  y: 20,
  width: 200,
  height: 150,
  text: 'hi',
  color: '#FFF59D',
  z: 1,
}

describe('memory repository', () => {
  test('loads an empty list by default', async () => {
    await expect(createMemoryRepository().load()).resolves.toEqual([])
  })

  test('loads the initial notes', async () => {
    await expect(createMemoryRepository([note]).load()).resolves.toEqual([note])
  })

  test('upsert inserts a new note and replaces an existing one by id', async () => {
    const repo = createMemoryRepository()
    await repo.upsert(note)
    await repo.upsert({ ...note, text: 'changed' })
    await repo.upsert({ ...note, id: 'b' })
    await expect(repo.load()).resolves.toEqual([
      { ...note, text: 'changed' },
      { ...note, id: 'b' },
    ])
  })

  test('remove deletes a note by id and ignores unknown ids', async () => {
    const repo = createMemoryRepository([note, { ...note, id: 'b' }])
    await repo.remove('a')
    await repo.remove('missing')
    await expect(repo.load()).resolves.toEqual([{ ...note, id: 'b' }])
  })

  test('stored notes are isolated from caller mutation', async () => {
    const own = { ...note }
    const repo = createMemoryRepository()
    await repo.upsert(own)
    own.text = 'mutated'
    const loaded = await repo.load()
    const first = loaded[0]
    if (first) first.text = 'mutated too'
    await expect(repo.load()).resolves.toEqual([note])
  })
})
