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
import { Plus, CalendarDays, ListChecks, Settings, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { formatISO, startOfWeek } from 'date-fns'
// Load FullCalendar CSS locally via Vite alias (see vite.config.ts)
// FullCalendar CSS is linked globally from index.html (copied to /vendor via postinstall)
import { useProjectStore } from '../store/projectStore'
import { useNodeStore } from '../store/nodeStore'
import ConfirmDialog from '../components/ConfirmDialog'
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

type TasksSubView = 'board' | 'calendar'

function TasksView() {
  const { currentProject } = useProjectStore()
  const { nodes, loadNodes, updateTaskStatus, deleteNode, isLoading } = useNodeStore()
  const [subView, setSubView] = useState<TasksSubView>('board')
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month')
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(false)
  const [statusFilter, setStatusFilter] = useState<string[] | null>(null)
  const [defaultDue, setDefaultDue] = useState<string | undefined>(undefined)

  // No runtime CSS injection needed; imports use local files
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<TaskState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<VerbweaverNode | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [columns, setColumns] = useState<KanbanColumn[]>(defaultColumns)
  const [defaultColumnId, setDefaultColumnId] = useState<string>(defaultColumns[0].id)
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(true)
  const [confirmState, setConfirmState] = useState<{ open: boolean; nodePath?: string; nodeName?: string }>({ open: false })
  
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

  // Persist/recover subview per project and tab
  useEffect(() => {
    const key = `${currentProject?.id || 'global'}:tasks-view`
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.subView === 'board' || parsed?.subView === 'calendar') setSubView(parsed.subView)
        if (parsed?.calendarMode === 'month' || parsed?.calendarMode === 'week') setCalendarMode(parsed.calendarMode)
        if (parsed?.calendarDate) setCalendarDate(new Date(parsed.calendarDate))
      }
    } catch {}
  }, [currentProject?.id])

  useEffect(() => {
    const key = `${currentProject?.id || 'global'}:tasks-view`
    try {
      localStorage.setItem(key, JSON.stringify({ subView, calendarMode, calendarDate }))
    } catch {}
  }, [subView, calendarMode, calendarDate, currentProject?.id])

  const loadColumns = async () => {
    if (!currentProject) return

    try {
      setIsLoadingColumns(true)
      const threadsSettings = await projectsApi.getTasksSettings(currentProject.id)
      if (threadsSettings.columns && threadsSettings.columns.length > 0) {
        setColumns(threadsSettings.columns)
      }
      if (threadsSettings.defaultColumnId) {
        setDefaultColumnId(threadsSettings.defaultColumnId)
      }
    } catch (error) {
      console.error('Failed to load column configuration:', error)
      // Keep using default columns
    } finally {
      setIsLoadingColumns(false)
    }
  }

  const handleColumnsChange = async (newColumns: KanbanColumn[]) => {
    await saveThreadsSettings(newColumns, defaultColumnId)
  }

  const handleDefaultChange = async (newDefaultId: string) => {
    setDefaultColumnId(newDefaultId)
    await saveThreadsSettings(columns, newDefaultId)
  }

  const saveThreadsSettings = async (cols: KanbanColumn[], defaultId: string) => {
    if (!currentProject) return
    try {
      setColumns(cols)
      await projectsApi.updateTasksSettings(currentProject.id, { columns: cols, defaultColumnId: defaultId })
    } catch (error) {
      console.error('Failed to update column configuration:', error)
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
        navigate('/tasks', { replace: true })
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
      if (!node.isDirectory && node.hasTask) {
        // Exclude any files under uploads/nodes from appearing as tasks
        if (node.path.startsWith('uploads/nodes/')) {
          return
        }
        // Treat all files as tasks - they all represent content that can be managed
        // If no task status is set, default to first column
        const status = node.taskStatus || defaultColumnId || columns[0]?.id || 'todo'
        
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

  const handleRequestDelete = (node: VerbweaverNode) => {
    const name = node.metadata?.title || node.name
    setConfirmState({ open: true, nodePath: node.path, nodeName: name })
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
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setSubView('board')}
                className={clsx(
                  'px-3 py-1.5 text-sm flex items-center gap-1',
                  subView === 'board' ? 'bg-primary text-primary-foreground' : 'bg-background'
                )}
                title="Board"
              >
                <ListChecks className="w-4 h-4" /> Board
              </button>
              <button
                onClick={() => setSubView('calendar')}
                className={clsx(
                  'px-3 py-1.5 text-sm flex items-center gap-1 border-l border-border',
                  subView === 'calendar' ? 'bg-primary text-primary-foreground' : 'bg-background'
                )}
                title="Calendar"
              >
                <CalendarDays className="w-4 h-4" /> Calendar
              </button>
            </div>

            {subView === 'board' && (
              <>
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
              </>
            )}
            {subView === 'calendar' && (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - (calendarMode==='month'?1:0), prev.getDate() - (calendarMode==='week'?7:0)))}
                    className="p-2 rounded hover:bg-accent"
                    title="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCalendarDate(new Date())}
                    className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + (calendarMode==='month'?1:0), prev.getDate() + (calendarMode==='week'?7:0)))}
                    className="p-2 rounded hover:bg-accent"
                    title="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setCalendarMode('month')}
                    className={clsx('px-3 py-1.5 text-sm', calendarMode==='month' ? 'bg-accent' : '')}
                  >Month</button>
                  <button
                    onClick={() => setCalendarMode('week')}
                    className={clsx('px-3 py-1.5 text-sm border-l border-border', calendarMode==='week' ? 'bg-accent' : '')}
                  >Week</button>
                </div>
                <select
                  className="px-2 py-1 rounded border border-border text-sm"
                  value={statusFilter ? statusFilter.join(',') : ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) setStatusFilter(null)
                    else setStatusFilter(v.split(',').filter(Boolean))
                  }}
                >
                  <option value="">All statuses</option>
                  {columns.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowUnscheduled(s => !s)}
                  className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
                >
                  {showUnscheduled ? 'Hide Unscheduled' : 'Show Unscheduled'}
                </button>
                <button
                  onClick={() => handleCreateTask('todo')}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {subView === 'board' ? (
        <div className="flex-1 overflow-x-auto">
          <div className="h-full p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading tasks...</p>
              </div>
            ) : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-4 h-full">
                  {columns.map(column => (
                    <DroppableColumn key={column.id} id={column.id} title={column.title} color={column.color} onCreateTask={() => handleCreateTask(column.id)}>
                      <SortableContext items={getTasksByStatus(column.id).map(node => node.path)} strategy={verticalListSortingStrategy}>
                        {getTasksByStatus(column.id).map((node) => (
                          <TaskCard key={node.path} node={node} isDragging={activeId === node.path} onClick={handleTaskClick} onRequestDelete={handleRequestDelete} />
                        ))}
                      </SortableContext>
                    </DroppableColumn>
                  ))}
                  {getTasksByStatus('invalid').length > 0 && (
                    <DroppableColumn key="invalid" id="invalid" title="Invalid Status" color="bg-red-500" onCreateTask={() => {}}>
                      <SortableContext items={getTasksByStatus('invalid').map(node => node.path)} strategy={verticalListSortingStrategy}>
                        {getTasksByStatus('invalid').map((node) => (
                          <TaskCard key={node.path} node={node} isDragging={activeId === node.path} onClick={handleTaskClick} onRequestDelete={handleRequestDelete} hasInvalidStatus={true} />
                        ))}
                      </SortableContext>
                    </DroppableColumn>
                  )}
                </div>
                <DragOverlay>
                  {activeNode ? <TaskCard node={activeNode} isDragging={true} /> : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex">
            <div className="flex-1 overflow-auto p-2">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView={calendarMode === 'month' ? 'dayGridMonth' : 'dayGridWeek'}
                headerToolbar={false}
                height="100%"
                firstDay={startOfWeek(new Date()).getDay()}
                initialDate={calendarDate}
                datesSet={(arg) => {
                  setCalendarDate(arg.start)
                }}
                events={(() => {
                  const events: any[] = []
                  columns.forEach(col => {
                    const tasks = (tasksByStatus[col.id] || [])
                      .filter(t => !!(t.metadata?.task?.dueDate))
                      .filter(t => !statusFilter || statusFilter.includes(col.id))
                  
                    tasks.forEach(t => {
                      const due = new Date(t.metadata.task.dueDate)
                      if (!isNaN(due.getTime())) {
                        events.push({
                          id: t.path,
                          title: t.metadata?.title || t.name,
                          start: formatISO(due, { representation: 'date' }),
                          allDay: true,
                          color: undefined,
                          textColor: undefined,
                          classNames: [col.color],
                        })
                      }
                    })
                  })
                  return events
                })()}
                eventClick={(info) => {
                  const node = nodes.get(info.event.id)
                  if (node) handleTaskClick(node as any)
                }}
                dateClick={(info) => {
                  setSelectedColumn('todo' as any)
                  setDefaultDue(info.dateStr)
                  setIsCreateModalOpen(true)
                }}
                editable
                eventDrop={async (info) => {
                  const nodePath = info.event.id
                  const node = nodes.get(nodePath)
                  if (node) {
                    const nextDate = info.event.start
                    if (nextDate) {
                      const updated = { ...(node.metadata.task || {}), dueDate: nextDate.toISOString() }
                      await useNodeStore.getState().updateNode(node.path, { metadata: { task: updated } as any })
                    }
                  }
                }}
              />
            </div>
            {showUnscheduled && (
              <div className="w-80 border-l border-border p-3 overflow-y-auto">
                <h3 className="text-sm font-medium mb-2">Unscheduled</h3>
                <div className="space-y-2">
                  {Array.from(nodes.values()).filter(n => !n.isDirectory && n.hasTask && !n.metadata?.task?.dueDate && !n.path.startsWith('uploads/nodes/')).map(n => (
                    <div key={n.path} className="p-2 rounded border border-border hover:bg-accent cursor-pointer" onClick={() => handleTaskClick(n as any)}>
                      <div className="text-sm font-medium">{n.metadata?.title || n.name}</div>
                      <div className="text-xs text-muted-foreground">No due date</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <CreateTaskModal
          projectId={currentProject?.id}
          defaultStatus={selectedColumn || 'todo'}
          defaultDueDate={defaultDue}
          onClose={() => {
            setIsCreateModalOpen(false)
            setSelectedColumn(null)
            setDefaultDue(undefined)
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
          onDelete={() => {
            if (selectedTask) handleRequestDelete(selectedTask)
          }}
        />
      )}

      {/* Column Manager Modal */}
      {isColumnManagerOpen && (
        <ColumnManager 
              columns={columns}
              defaultColumnId={defaultColumnId}
              onColumnsChange={handleColumnsChange}
              onDefaultChange={handleDefaultChange}
              onClose={() => setIsColumnManagerOpen(false)}
            />
      )}
      <ConfirmDialog
      isOpen={confirmState.open}
      title="Delete task"
      message={`Are you sure you want to delete "${confirmState.nodeName || ''}"? This action cannot be undone.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={async () => {
        if (!confirmState.nodePath) return
        try {
          await deleteNode(confirmState.nodePath)
          // If deleted task was open in details, close it
          if (selectedTask?.path === confirmState.nodePath) {
            setIsDetailModalOpen(false)
            setSelectedTask(null)
          }
        } finally {
          setConfirmState({ open: false })
        }
      }}
      onCancel={() => setConfirmState({ open: false })}
      />
    </div>
  )
}

export default TasksView