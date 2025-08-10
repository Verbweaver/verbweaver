import { useEffect, useState, useMemo, useRef } from 'react'
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
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
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
  const [tagsFilter, setTagsFilter] = useState<string[] | null>(null)
  const [defaultDue, setDefaultDue] = useState<string | undefined>(undefined)
  const calendarRef = useRef<any>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const calendarElRef = useRef<HTMLDivElement | null>(null)

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
        if (Array.isArray(parsed?.statusFilter)) setStatusFilter(parsed.statusFilter)
        if (Array.isArray(parsed?.tagsFilter)) setTagsFilter(parsed.tagsFilter)
      }
    } catch {}
  }, [currentProject?.id])

  useEffect(() => {
    const key = `${currentProject?.id || 'global'}:tasks-view`
    try {
      localStorage.setItem(key, JSON.stringify({ subView, calendarMode, calendarDate, statusFilter, tagsFilter }))
    } catch {}
  }, [subView, calendarMode, calendarDate, statusFilter, tagsFilter, currentProject?.id])

  // Enable dragging from Unscheduled list into FullCalendar
  useEffect(() => {
    if (subView !== 'calendar') return
    const container = document.getElementById('vw-unscheduled')
    if (!container) return
    try {
      // Initialize FullCalendar Draggable for external events
      new Draggable(container, {
        itemSelector: '.vw-unscheduled-item',
        eventData: (el: HTMLElement) => {
          const id = (el.getAttribute('data-path') || '')
          const title = (el.querySelector('.text-sm.font-medium') as HTMLElement)?.innerText || el.getAttribute('data-title') || 'Task'
          return { id, title }
        },
      })
    } catch (e) {
      console.warn('Failed to init external draggable', e)
    }
  }, [subView, nodes, showUnscheduled])

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

  // All tags available in project (for filter UI)
  const allTags = useMemo(() => {
    const s = new Set<string>()
    nodes.forEach(n => {
      const t = (n.metadata?.tags || []) as string[]
      t.forEach(tag => s.add(tag))
    })
    return Array.from(s).sort()
  }, [nodes])

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
                    onClick={() => {
                      const api = calendarRef.current?.getApi?.()
                      if (api) api.prev()
                    }}
                    className="p-2 rounded hover:bg-accent"
                    title="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const api = calendarRef.current?.getApi?.()
                      if (api) api.today()
                    }}
                    className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const api = calendarRef.current?.getApi?.()
                      if (api) api.next()
                    }}
                    className="p-2 rounded hover:bg-accent"
                    title="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => {
                      setCalendarMode('month')
                      const api = calendarRef.current?.getApi?.()
                      if (api) api.changeView('dayGridMonth')
                    }}
                    className={clsx('px-3 py-1.5 text-sm', calendarMode==='month' ? 'bg-accent' : '')}
                  >Month</button>
                  <button
                    onClick={() => {
                      setCalendarMode('week')
                      const api = calendarRef.current?.getApi?.()
                      if (api) api.changeView('dayGridWeek')
                    }}
                    className={clsx('px-3 py-1.5 text-sm border-l border-border', calendarMode==='week' ? 'bg-accent' : '')}
                  >Week</button>
                </div>
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="px-3 py-1.5 rounded border border-border text-sm hover:bg-accent inline-flex items-center gap-2"
                  title="Filters"
                >
                  <Filter className="w-4 h-4" /> Filters
                </button>
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
                ref={calendarRef}
                datesSet={(arg) => {
                  setCalendarDate(arg.start)
                  // Keep local mode in sync with current view
                  setCalendarMode(arg.view.type === 'dayGridWeek' ? 'week' : 'month')
                }}
                droppable={true}
                events={(() => {
                  const events: any[] = []
                  columns.forEach(col => {
                    const tasks = (tasksByStatus[col.id] || [])
                      .filter(t => !!(t.metadata?.task?.dueDate))
                      .filter(t => !statusFilter || statusFilter.length === 0 || statusFilter.includes(col.id))
                      .filter(t => {
                        if (!tagsFilter || tagsFilter.length === 0) return true
                        const tags = (t.metadata?.tags || []) as string[]
                        return tags.some(tag => tagsFilter!.includes(tag))
                      })
                  
                    tasks.forEach(t => {
                      const dueStr: string | undefined = t.metadata?.task?.dueDate
                      if (dueStr) {
                        events.push({
                          id: t.path,
                          title: t.metadata?.title || t.name,
                          start: dueStr, // pass date-only string to avoid timezone shift
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
                    const startStr = (info.event.startStr || '').split('T')[0] || undefined
                    if (startStr) {
                      const updated = { ...(node.metadata.task || {}), dueDate: startStr }
                      await useNodeStore.getState().updateNode(node.path, { metadata: { task: updated } as any })
                    }
                  }
                }}
                eventReceive={async (info) => {
                  // External drop from Unscheduled list
                  const nodePath = info.event.id
                  const droppedDateStr = (info.event.startStr || '').split('T')[0] || undefined
                  const node = nodes.get(nodePath)
                  if (node && droppedDateStr) {
                    const updated = { ...(node.metadata.task || {}), dueDate: droppedDateStr }
                    await useNodeStore.getState().updateNode(node.path, { metadata: { task: updated } as any })
                  }
                }}
              />
            </div>
            {showUnscheduled && (
              <div className="w-80 border-l border-border p-3 overflow-y-auto" id="vw-unscheduled">
                <h3 className="text-sm font-medium mb-2">Unscheduled</h3>
                <div className="space-y-2">
                  {Array.from(nodes.values()).filter(n => !n.isDirectory && n.hasTask && !n.metadata?.task?.dueDate && !n.path.startsWith('uploads/nodes/'))
                    .filter(n => {
                      const status = n.taskStatus || (n.metadata?.task?.status) || defaultColumnId || 'todo'
                      if (statusFilter && statusFilter.length > 0 && !statusFilter.includes(status)) return false
                      if (tagsFilter && tagsFilter.length > 0) {
                        const tags = (n.metadata?.tags || []) as string[]
                        if (!tags.some(tag => tagsFilter!.includes(tag))) return false
                      }
                      return true
                    })
                    .map(n => {
                    const title = n.metadata?.title || n.name
                    return (
                      <div
                        key={n.path}
                        className="p-2 rounded border border-border hover:bg-accent cursor-grab vw-unscheduled-item"
                        data-path={n.path}
                        data-title={title}
                        onClick={() => handleTaskClick(n as any)}
                      >
                      <div className="text-sm font-medium">{n.metadata?.title || n.name}</div>
                      <div className="text-xs text-muted-foreground">No due date</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters Dialog */}
      {filtersOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setFiltersOpen(false)}>
          <div className="bg-background border border-border rounded-lg w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button className="p-1 rounded hover:bg-accent" onClick={() => setFiltersOpen(false)}>✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Statuses</label>
                <div className="flex flex-wrap gap-2">
                  {columns.map(col => (
                    <label key={col.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={statusFilter ? statusFilter.includes(col.id) : false}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setStatusFilter(prev => {
                            let arr = prev ? [...prev] : []
                            if (checked) {
                              if (!arr.includes(col.id)) arr.push(col.id)
                            } else {
                              arr = arr.filter(id => id !== col.id)
                            }
                            return arr.length === 0 ? null : arr
                          })
                        }}
                      />
                      {col.title}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tags</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-auto p-1 border border-border rounded">
                  {allTags.length === 0 && (
                    <span className="text-sm text-muted-foreground">No tags in project</span>
                  )}
                  {allTags.map(tag => (
                    <label key={tag} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tagsFilter ? tagsFilter.includes(tag) : false}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setTagsFilter(prev => {
                            let arr = prev ? [...prev] : []
                            if (checked) {
                              if (!arr.includes(tag)) arr.push(tag)
                            } else {
                              arr = arr.filter(t => t !== tag)
                            }
                            return arr.length === 0 ? null : arr
                          })
                        }}
                      />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="px-3 py-1.5 rounded border border-border" onClick={() => { setStatusFilter(null); setTagsFilter(null) }}>Clear</button>
              <button className="px-3 py-1.5 rounded bg-primary text-primary-foreground" onClick={() => setFiltersOpen(false)}>Close</button>
            </div>
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
            try { useNodeStore.getState().loadNodes() } catch {}
          }}
          onUpdate={(n) => {
            handleTaskUpdate(n)
            // Refresh calendar data to reflect updates immediately
            try { useNodeStore.getState().loadNodes() } catch {}
          }}
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
          try { await useNodeStore.getState().loadNodes() } catch {}
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