import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface LinkedNodeItem {
  path: string
  title: string
}

interface RemoveLinksModalProps {
  isOpen: boolean
  linkedNodes: LinkedNodeItem[]
  onClose: () => void
  onRemoveSelected: (selectedPaths: string[]) => Promise<void> | void
  initialSelected?: string[]
}

export default function RemoveLinksModal({ isOpen, linkedNodes, onClose, onRemoveSelected, initialSelected = [] }: RemoveLinksModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Reset selection when the modal is opened
    if (isOpen) {
      setSelected(new Set(initialSelected))
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg w-[520px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Remove links</h3>
          <button className="p-1.5 rounded hover:bg-accent" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-2">Select links to remove from this node:</p>
          <div className="max-h-64 overflow-auto border border-border rounded">
            <ul>
              {linkedNodes.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No links</li>
              )}
              {linkedNodes.map(ln => (
                <li key={ln.path} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0">
                  <input
                    type="checkbox"
                    checked={selected.has(ln.path)}
                    onChange={(e) => {
                      setSelected(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(ln.path); else next.delete(ln.path)
                        return next
                      })
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{ln.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{ln.path}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-between items-center gap-2 p-4 border-t">
          <div className="text-xs text-muted-foreground">{selected.size} selected</div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-input rounded hover:bg-accent" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
              disabled={selected.size === 0 || busy}
              onClick={async () => {
                try {
                  setBusy(true)
                  await onRemoveSelected(Array.from(selected))
                } finally {
                  setBusy(false)
                }
              }}
            >Remove selected</button>
          </div>
        </div>
      </div>
    </div>
  )
}


