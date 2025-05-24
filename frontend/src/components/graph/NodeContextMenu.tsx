import { useEffect, useRef } from 'react'
import { NODE_TYPES } from '@verbweaver/shared'
import { Plus, Trash2, Edit, Link } from 'lucide-react'

interface NodeContextMenuProps {
  x: number
  y: number
  nodeId?: string
  onCreateNode: (type: string, position?: { x: number; y: number }) => void
  onDeleteNode: (nodeId: string) => void
  onClose: () => void
}

function NodeContextMenu({ x, y, nodeId, onCreateNode, onDeleteNode, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const nodeTypes = [
    { type: NODE_TYPES.NOTE, label: 'Note' },
    { type: NODE_TYPES.CHAPTER, label: 'Chapter' },
    { type: NODE_TYPES.CHARACTER, label: 'Character' },
    { type: NODE_TYPES.LOCATION, label: 'Location' },
    { type: NODE_TYPES.SCENE, label: 'Scene' },
    { type: NODE_TYPES.TASK, label: 'Task' },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[150px]"
      style={{ left: x, top: y }}
    >
      {!nodeId && (
        <>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Create Node</div>
          {nodeTypes.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => onCreateNode(type)}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <Plus className="w-3 h-3" />
              {label}
            </button>
          ))}
        </>
      )}
      
      {nodeId && (
        <>
          <button
            onClick={() => {
              // TODO: Open in editor
              onClose()
            }}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <Edit className="w-3 h-3" />
            Edit
          </button>
          
          <button
            onClick={() => {
              // TODO: Create link
              onClose()
            }}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <Link className="w-3 h-3" />
            Create Link
          </button>
          
          <div className="h-px bg-border my-1" />
          
          <button
            onClick={() => onDeleteNode(nodeId)}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </>
      )}
    </div>
  )
}

export default NodeContextMenu 