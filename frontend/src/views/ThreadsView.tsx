import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import { Plus, MoreHorizontal, Calendar, User, Tag, MessageSquare, Link, Settings } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useNodeStore } from '../store/nodeStore'
import { projectsApi } from '../api/projects'
import { TaskState } from '@verbweaver/shared'
import TaskCard from '../components/tasks/TaskCard'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import TaskDetailModal from '../components/tasks/TaskDetailModal'
import ColumnManager, { KanbanColumn } from '../components/tasks/ColumnManager'
import { Button } from '../components/ui/Button'
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

// Default columns fallback
const defaultColumns: KanbanColumn[] = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-blue-500' },
  { id: 'review', title: 'Review', color: 'bg-amber-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
]

function ThreadsView() {
  const { currentProject } = useProjectStore()
  const { nodes, loadNodes, updateTaskStatus, isLoading } = useNodeStore()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<TaskState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<VerbweaverNode | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [columns, setColumns] = useState<KanbanColumn[]>(defaultColumns)
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(true)
  
  // Handle URL parameters for opening specific tasks
  const { taskPath } = useParams()
  const navigate = useNavigate()

  // Load nodes when component mounts or project changes
  useEffect(() => {
    if (currentProject) {
      loadNodes()
    }
  }, [currentProject, loadNodes])

  // Load column configuration
  useEffect(() => {
    if (currentProject) {
      loadColumns()
    }
  }, [currentProject])

  const loadColumns = async () => {
    if (!currentProject) return

    try {
      setIsLoadingColumns(true)
      const threadsSettings = await projectsApi.getThreadsSettings(currentProject.id)
      if (threadsSettings.columns && threadsSettings.columns.length > 0) {
        setColumns(threadsSettings.columns)
      }
    } catch (error) {
      console.error('Failed to load column configuration:', error)
      // Keep using default columns
    } finally {
      setIsLoadingColumns(false)
    }
  }

  const handleColumnsChange = async (newColumns: KanbanColumn[]) => {
    if (!currentProject) return

    try {
      setColumns(newColumns)
      await projectsApi.updateThreadsSettings(currentProject.id, { columns: newColumns })
    } catch (error) {
      console.error('Failed to update column configuration:', error)
      // Revert to previous state
      loadColumns()
    }
  }

  // Handle opening task from URL parameter
  useEffect(() => {
    if (taskPath && nodes.size > 0) {
      const decodedTaskPath = decodeURIComponent(taskPath)
      const taskNode = nodes.get(decodedTaskPath)
      
      if (taskNode && taskNode.isMarkdown) {
        console.log('Opening task from URL:', decodedTaskPath, taskNode)
        setSelectedTask(taskNode)
        setIsDetailModalOpen(true)
        // Clear the URL parameter after opening the task
        navigate('/threads', { replace: true })
      }
    }
  }, [taskPath, nodes, navigate])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Get all nodes as tasks, grouped by status
  // According to DESIGN.md: "Remember that each Task is backed by a Markdown file in the Git repository and is also rendered as a Node in the Graph"
  const tasksByStatus = useMemo(() => {
    const result: Record<string, VerbweaverNode[]> = {}
    
    // Initialize with current columns
    columns.forEach(column => {
      result[column.id] = []
    })
    
    // Add a special category for invalid statuses
    result['invalid'] = []
    
    Array.from(nodes.values()).forEach(node => {
      // Only treat files as tasks, not directories
      // Directories provide context but aren't tasks themselves
      if (!node.isDirectory) {
        // Treat all files as tasks - they all represent content that can be managed
        // If no task status is set, default to first column
        const status = node.taskStatus || columns[0]?.id || 'todo'
        
        // Check if the status is valid (exists in current columns)
        if (columns.some(col => col.id === status)) {
          if (!result[status]) result[status] = []
          result[status].push(node)
        } else {
          // Invalid status - put in invalid category
          result['invalid'].push(node)
        }
      }
    })
    
    return result
  }, [nodes, columns])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || !currentProject) return

    const nodePath = active.id as string
    const newStatus = over.id as string

    updateTaskStatus(nodePath, newStatus as TaskState)
  }

  const getTasksByStatus = (status: string) => {
    return tasksByStatus[status] || []
  }

  const handleCreateTask = (columnId: string) => {
    setSelectedColumn(columnId as TaskState)
    setIsCreateModalOpen(true)
  }

  const handleTaskClick = (node: VerbweaverNode) => {
    setSelectedTask(node)
    setIsDetailModalOpen(true)
  }

  const handleTaskUpdate = (updatedNode: VerbweaverNode) => {
    setSelectedTask(updatedNode)
    // The nodeStore will handle the update automatically
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
              Manage your project tasks and track progress. Every node in your project is a task.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsColumnManagerOpen(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Manage Columns
            </Button>
            <button
              onClick={() => handleCreateTask('todo')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
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
                          onClick={handleTaskClick}
                        />
                      ))}
                    </SortableContext>
                  </DroppableColumn>
                ))}
                
                {/* Invalid Status Column */}
                {getTasksByStatus('invalid').length > 0 && (
                  <DroppableColumn
                    key="invalid"
                    id="invalid"
                    title="Invalid Status"
                    color="bg-red-500"
                    onCreateTask={() => {}}
                  >
                    <SortableContext
                      items={getTasksByStatus('invalid').map(node => node.path)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getTasksByStatus('invalid').map((node) => (
                        <TaskCard
                          key={node.path}
                          node={node}
                          isDragging={activeId === node.path}
                          onClick={handleTaskClick}
                          hasInvalidStatus={true}
                        />
                      ))}
                    </SortableContext>
                  </DroppableColumn>
                )}
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
          projectId={currentProject?.id}
          defaultStatus={selectedColumn || 'todo'}
          onClose={() => {
            setIsCreateModalOpen(false)
            setSelectedColumn(null)
          }}
        />
      )}

      {/* Task Detail Modal */}
      {isDetailModalOpen && selectedTask && (
        <TaskDetailModal
          node={selectedTask}
          availableStatuses={columns.map(col => col.id)}
          columns={columns}
          onClose={() => {
            setIsDetailModalOpen(false)
            setSelectedTask(null)
          }}
          onUpdate={handleTaskUpdate}
        />
      )}

      {/* Column Manager Modal */}
      {isColumnManagerOpen && (
        <ColumnManager
          columns={columns}
          onColumnsChange={handleColumnsChange}
          onClose={() => setIsColumnManagerOpen(false)}
        />
      )}
    </div>
  )
}

export default ThreadsView 