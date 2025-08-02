import { useEffect, useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus, MoreHorizontal, Calendar, User } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useNodeStore } from '../store/nodeStore'
import { TaskState } from '@verbweaver/shared'
import TaskCard from '../components/tasks/TaskCard'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import clsx from 'clsx'

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

// Droppable Column Component
function DroppableColumn({ 
  id, 
  title, 
  color, 
  children, 
  onCreateTask 
}: { 
  id: string
  title: string
  color: string
  children: React.ReactNode
  onCreateTask: () => void
}) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div className="flex-1 min-w-[300px] flex flex-col bg-muted/30 rounded-lg">
      {/* Column Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={clsx('w-3 h-3 rounded-full', color)} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        
        <button
          onClick={onCreateTask}
          className="p-1 rounded hover:bg-accent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Column Content */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin">
        {children}
      </div>
    </div>
  )
}

const columns = [
  { id: 'todo' as TaskState, title: 'To Do', color: 'bg-gray-500' },
  { id: 'in-progress' as TaskState, title: 'In Progress', color: 'bg-blue-500' },
  { id: 'review' as TaskState, title: 'Review', color: 'bg-amber-500' },
  { id: 'done' as TaskState, title: 'Done', color: 'bg-green-500' },
]

function ThreadsView() {
  const { currentProject } = useProjectStore()
  const { nodes, loadNodes, updateTaskStatus, isLoading } = useNodeStore()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<TaskState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  useEffect(() => {
    if (currentProject) {
      loadNodes()
    }
  }, [currentProject, loadNodes])

  // Get all nodes that have tasks, grouped by status
  const tasksByStatus = useMemo(() => {
    const result: Record<TaskState, VerbweaverNode[]> = {
      'todo': [],
      'in-progress': [],
      'review': [],
      'done': [],
      'archived': []
    }
    
    Array.from(nodes.values()).forEach(node => {
      if (node.hasTask && node.taskStatus) {
        result[node.taskStatus].push(node)
      }
    })
    
    return result
  }, [nodes])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || !currentProject) return

    const nodePath = active.id as string
    const newStatus = over.id as TaskState

    updateTaskStatus(nodePath, newStatus)
  }

  const getTasksByStatus = (status: TaskState) => {
    return tasksByStatus[status] || []
  }

  const handleCreateTask = (columnId: TaskState) => {
    setSelectedColumn(columnId)
    setIsCreateModalOpen(true)
  }

  const activeNode = activeId ? Array.from(nodes.values()).find(node => node.path === activeId) : null

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to manage tasks
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your project tasks and track progress
            </p>
          </div>
          
          <button
            onClick={() => handleCreateTask('todo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="h-full p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 h-full">
                {columns.map(column => (
                  <DroppableColumn
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    color={column.color}
                    onCreateTask={() => handleCreateTask(column.id)}
                  >
                    <SortableContext
                      items={getTasksByStatus(column.id).map(node => node.path)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getTasksByStatus(column.id).map((node) => (
                        <TaskCard
                          key={node.path}
                          node={node}
                          isDragging={activeId === node.path}
                        />
                      ))}
                    </SortableContext>
                  </DroppableColumn>
                ))}
              </div>

              <DragOverlay>
                {activeNode ? (
                  <TaskCard
                    node={activeNode}
                    isDragging={true}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <CreateTaskModal
          defaultStatus={selectedColumn || 'todo'}
          onClose={() => {
            setIsCreateModalOpen(false)
            setSelectedColumn(null)
          }}
        />
      )}
    </div>
  )
}

export default ThreadsView 