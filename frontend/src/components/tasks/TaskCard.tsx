import { Calendar, User, Tag, MoreVertical, MessageSquare, Link, FileText, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { format } from 'date-fns'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskState } from '@verbweaver/shared'

// Define VerbweaverNode interface locally
interface VerbweaverNode {
  path: string
  name: string
  isDirectory: boolean
  isMarkdown: boolean
  metadata: any
  content: string | null
  hardLinks: {
    parent: string | null
    children: string[]
  }
  softLinks: string[]
  hasTask: boolean
  taskStatus?: TaskState
}

interface TaskCardProps {
  node: VerbweaverNode
  isDragging?: boolean
  onClick?: (node: VerbweaverNode) => void
  onRequestDelete?: (node: VerbweaverNode) => void
  hasInvalidStatus?: boolean
}

function TaskCard({ node, isDragging, onClick, onRequestDelete, hasInvalidStatus }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: node.path })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Extract task information from metadata
  const task = node.metadata.task || {}
  const title = node.metadata.title || node.name
  const description = node.metadata.description || node.content?.split('\n').find(line => line.trim() && !line.startsWith('#')) || ''
  const priority = task.priority || node.metadata.priority || 'medium'
  const assignee = task.assignee || node.metadata.assignee
  const dueDate = task.dueDate || node.metadata.dueDate
  const tags = node.metadata.tags || []
  const comments = task.comments || []
  const softLinks = node.softLinks || []
  
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-red-500 bg-red-50 dark:bg-red-950'
      case 'high':
        return 'border-orange-500 bg-orange-50 dark:bg-orange-950'
      case 'medium':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
      case 'low':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950'
      default:
        return 'border-border bg-background'
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onClick) {
      onClick(node)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={clsx(
        'p-3 rounded-md border cursor-pointer transition-all group',
        getPriorityColor(priority),
        isDragging && 'opacity-50 rotate-2 scale-105',
        !isDragging && 'hover:shadow-md',
        hasInvalidStatus && 'border-destructive bg-destructive/5'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm line-clamp-2">{title}</h4>
            {hasInvalidStatus && (
              <div className="flex items-center gap-1 text-destructive" title="Invalid status - update required">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs">Invalid Status</span>
              </div>
            )}
          </div>
          {/* Show folder context for files */}
          {!node.isDirectory && node.hardLinks.parent && (
            <div className="flex items-center gap-1 mt-1">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                in {node.hardLinks.parent}
              </span>
            </div>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            title="Task actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-1 w-36 rounded-md border bg-popover text-popover-foreground shadow focus:outline-none z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false)
                  onClick?.(node)
                }}
              >
                View details
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false)
                  navigate(`/editor/${encodeURIComponent(node.path)}`)
                }}
              >
                Go to node in Editor
              </button>
              {/* Stop tracking as Task */}
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={async () => {
                  setMenuOpen(false)
                  try {
                    const { useNodeStore } = await import('../../store/nodeStore')
                    const store = useNodeStore.getState()
                    const current = store.nodes.get(node.path)
                    if (!current) return
                    const prevTracked = (current.metadata as any)?.task?.tracked !== false
                    if (!prevTracked) return
                    const nextTask = { ...(current.metadata as any).task, tracked: false }
                    await store.updateNode(node.path, { metadata: { task: nextTask } as any })
                  } catch (e) {
                    console.error('Failed to stop tracking as task', e)
                  }
                }}
              >
                Stop tracking as Task
              </button>
              <div className="h-px bg-border my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => {
                  setMenuOpen(false)
                  onRequestDelete?.(node)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {description}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 3).map((tag: string, index: number) => (
            <span
              key={index}
              className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{(() => {
                // dueDate is a YYYY-MM-DD date-only string; avoid timezone conversion
                try {
                  const [y, m, d] = String(dueDate).split('-').map(n => parseInt(n, 10))
                  const dt = new Date(y, (m || 1) - 1, d || 1)
                  return format(dt, 'MMM d')
                } catch {
                  return String(dueDate)
                }
              })()}</span>
            </div>
          )}
          
          {assignee && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{assignee}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Comments count */}
          {comments.length > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{comments.length}</span>
            </div>
          )}
          
          {/* Soft links count */}
          {softLinks.length > 0 && (
            <div className="flex items-center gap-1">
              <Link className="w-3 h-3" />
              <span>{softLinks.length}</span>
            </div>
          )}
          
          {/* Tags count */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              <span>{tags.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskCard 