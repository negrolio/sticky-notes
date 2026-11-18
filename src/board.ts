import { useEffect, useState } from 'react'
import type { Size } from './geometry.ts'

/** The board fills the viewport at (0,0), so client coordinates are board coordinates. */
export function boardSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** The board size, updated on window resize. */
export function useBoardSize(): Size {
  const [size, setSize] = useState(boardSize)

  useEffect(() => {
    const onResize = () => {
      setSize(boardSize())
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return size
}
