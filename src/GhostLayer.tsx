import { useEffect, type CSSProperties } from 'react'
import type { Ghost } from './ghosts.ts'
import { DEFAULT_FONT_SIZE, fontStack, GHOST_MS } from './model.ts'

interface GhostLayerProps {
  ghosts: readonly Ghost[]
  /** Must be stable across renders. */
  onDone: (key: number) => void
}

/**
 * A sibling after the board and before the trash zone, so ghosts are drawn above every note and
 * vanish into the zone. Hidden from assistive technology: the toast already announces the delete.
 */
export function GhostLayer({ ghosts, onDone }: GhostLayerProps) {
  return (
    <div className="ghosts" aria-hidden="true">
      {ghosts.map((ghost) => (
        <GhostView key={ghost.key} ghost={ghost} onDone={onDone} />
      ))}
    </div>
  )
}

function GhostView({ ghost, onDone }: { ghost: Ghost; onDone: (key: number) => void }) {
  const { key, note, rect, dx, dy } = ghost

  // jsdom, and a tab in the background, may never fire animationend.
  useEffect(() => {
    const timer = setTimeout(() => {
      onDone(key)
    }, GHOST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [key, onDone])

  const style: CSSProperties & Record<'--ghost-dx' | '--ghost-dy', string> = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    backgroundColor: note.color,
    '--ghost-dx': `${String(dx)}px`,
    '--ghost-dy': `${String(dy)}px`,
  }

  return (
    <div
      className="ghost"
      style={style}
      onAnimationEnd={() => {
        onDone(key)
      }}
    >
      <div className="ghost-header" />
      <div className="ghost-text" style={{ fontFamily: fontStack(note), fontSize: note.fontSize ?? DEFAULT_FONT_SIZE }}>
        {note.text}
      </div>
    </div>
  )
}
