import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

interface DeleteAllDialogProps {
  count: number
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The delete-all confirmation (decision 24): a modal alertdialog over a backdrop. Focus starts on
 * Cancel and stays in the dialog. Escape, Cancel or a click on the backdrop cancel.
 */
export function DeleteAllDialog({ count, onCancel, onConfirm }: DeleteAllDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Moving focus here also blurs any textarea, which writes its pending text first (decision 6).
  useLayoutEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Focus that leaves the dialog by any other way than Tab, such as a script, is brought back.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) cancelRef.current?.focus()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const first = cancelRef.current
    const last = confirmRef.current
    const wrapTo = event.shiftKey
      ? document.activeElement === first && last
      : document.activeElement === last && first
    if (!wrapTo) return
    event.preventDefault()
    wrapTo.focus()
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-all-title"
        aria-describedby="delete-all-text"
        onKeyDown={onKeyDown}
      >
        <h2 id="delete-all-title">Delete all notes?</h2>
        <p id="delete-all-text">{`This deletes ${count === 1 ? '1 note' : `${String(count)} notes`}. You can undo it.`}</p>
        <div className="dialog-buttons">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className="danger" onClick={onConfirm}>
            Delete all
          </button>
        </div>
      </div>
    </div>
  )
}
