import { VerbweaverNode } from '@verbweaver/shared'
import { Calendar, User, Tag, MoreVertical } from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'

interface TaskCardProps {
  node: VerbweaverNode
  isDragging?: boolean
}

function TaskCard({ node, isDragging }: TaskCardProps) {
  const task = node.metadata.task
  
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-red-500 bg-red-50 dark:bg-red-950'
      case 'high':
        return 'border-orange-500 bg-orange-50 dark:bg-orange-950'
      case 'medium':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
      default:
        return 'border-border bg-background'
    }
  }

  return (
    <div
      className={clsx(
        'p-3 rounded-md border cursor-pointer transition-all',
        getPriorityColor(task?.priority),
        isDragging && 'opacity-50 rotate-2 scale-105',
        !isDragging && 'hover:shadow-md'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm line-clamp-2">{node.metadata.title}</h4>
        <button className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Description from content preview */}
      {node.content && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {node.content.split('\n').find(line => line.trim() && !line.startsWith('#')) || ''}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {task?.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(task.dueDate), 'MMM d')}</span>
            </div>
          )}
          
          {task?.assignee && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{task.assignee}</span>
            </div>
          )}
        </div>

        {node.metadata.tags && node.metadata.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>{node.metadata.tags.length}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default TaskCard 