import { useCallback, useRef, useState } from 'react'
import { boardSize } from './board.ts'
import type { Rect } from './geometry.ts'
import { TRASH_SIZE, type Note } from './model.ts'

/** A visual copy of a deleted note on its way into the trash (decision 22). */
export interface Ghost {
  key: number
  note: Note
  /** Where the note was displayed when it was deleted. */
  rect: Rect
  /** From the rect's centre to the trash zone's centre. */
  dx: number
  dy: number
  /** When the ghost starts, for the staggered ghosts of a delete all. */
  delayMs: number
}

/** The ghosts being drawn. Adding and removing them never touches notes state or the repository. */
export function useGhosts() {
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([])
  const nextKey = useRef(0)

  const addGhost = useCallback((note: Note, rect: Rect, delayMs = 0) => {
    const board = boardSize()
    const ghost: Ghost = {
      key: nextKey.current++,
      note,
      rect,
      dx: board.width - TRASH_SIZE / 2 - (rect.x + rect.width / 2),
      dy: board.height - TRASH_SIZE / 2 - (rect.y + rect.height / 2),
      delayMs,
    }
    setGhosts((all) => [...all, ghost])
  }, [])

  const removeGhost = useCallback((key: number) => {
    setGhosts((all) => (all.some((g) => g.key === key) ? all.filter((g) => g.key !== key) : all))
  }, [])

  /** Drops the ghosts of a note that is back, so it is not seen twice. */
  const removeGhostsOf = useCallback((id: string) => {
    setGhosts((all) => (all.some((g) => g.note.id === id) ? all.filter((g) => g.note.id !== id) : all))
  }, [])

  return { ghosts, addGhost, removeGhost, removeGhostsOf }
}
