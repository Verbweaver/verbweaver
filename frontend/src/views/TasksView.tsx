import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
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
import { Plus, CalendarDays, ListChecks, Settings, ChevronLeft, ChevronRight, Filter, CheckSquare, BarChart2 } from 'lucide-react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import { formatISO, startOfWeek } from 'date-fns'
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

type TasksSubView = 'board' | 'calendar' | 'todo' | 'charts'

function TasksView() {
  const { currentProject } = useProjectStore()
  const { nodes, loadNodes, updateTaskStatus, deleteNode, isLoading } = useNodeStore()
  const [subView, setSubView] = useState<TasksSubView>('board')
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month')
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(false)
  const [statusFilter, setStatusFilter] = useState<string[] | null>(null)
  const [tagsFilter, setTagsFilter] = useState<string[] | null>(null)
	// Charts date range (YYYY-MM-DD)
	const [chartsFrom, setChartsFrom] = useState<string | null>(null)
	const [chartsTo, setChartsTo] = useState<string | null>(null)
  const [defaultDue, setDefaultDue] = useState<string | undefined>(undefined)
  const calendarRef = useRef<any>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const formatLocalYMD = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const parseLocalYMD = (s: string): Date => {
    const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
    return new Date(y, (m || 1) - 1, d || 1)
  }
  const [selectedDay, setSelectedDay] = useState<string>(() => formatLocalYMD(new Date()))
  const [relativeToSelected, setRelativeToSelected] = useState<boolean>(false)
  const [overdueSortDesc, setOverdueSortDesc] = useState<boolean>(true)
  const [completedColumnId, setCompletedColumnId] = useState<string | null>(null)
  const [uncompleteDialog, setUncompleteDialog] = useState<{ open: boolean; nodePath?: string }>({ open: false })
  const [showCompleted, setShowCompleted] = useState<boolean>(false)
  const [uncompleteTarget, setUncompleteTarget] = useState<string>('')
  const calendarElRef = useRef<HTMLDivElement | null>(null)
  const ganttCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const burndownCanvasRef = useRef<HTMLCanvasElement | null>(null)

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
  const [optimisticCompleted, setOptimisticCompleted] = useState<Set<string>>(new Set())
  const effectiveCompletedId = useMemo(() => {
    if (completedColumnId) return completedColumnId
    const byTitle = columns.find(c => /done|complete/i.test(c.title))?.id
    if (byTitle) return byTitle
    const doneId = columns.find(c => c.id === 'done')?.id
    return doneId || null
  }, [completedColumnId, columns])
  const isTaskCompleted = (t: VerbweaverNode): boolean => {
    const status = (t.taskStatus || t.metadata?.task?.status) as string | undefined
    if (effectiveCompletedId && status === effectiveCompletedId) return true
    if (t.metadata?.task?.completedDate) return true
    return false
  }
  
  // Handle URL parameters for opening specific tasks
  const { taskPath } = useParams()
  const navigate = useNavigate()
  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N: New Task (Board or To-Do)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (subView === 'board') {
          handleCreateTask(defaultColumnId || 'todo')
        } else if (subView === 'todo') {
          setSelectedColumn('todo' as TaskState)
          setDefaultDue(selectedDay)
          setIsCreateModalOpen(true)
        }
        return
      }
      // Space/Enter on focused task list item toggles complete (handled per item via click); skip global handling
      // Esc: close dialogs
      if (e.key === 'Escape') {
        if (isDetailModalOpen) setIsDetailModalOpen(false)
        if (filtersOpen) setFiltersOpen(false)
        if (isCreateModalOpen) setIsCreateModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [subView, defaultColumnId, selectedDay, isDetailModalOpen, filtersOpen, isCreateModalOpen])

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
        if (typeof parsed?.todoShowCompleted === 'boolean') setShowCompleted(parsed.todoShowCompleted)
				if (typeof parsed?.chartsFrom === 'string' && parsed.chartsFrom) setChartsFrom(parsed.chartsFrom)
				if (typeof parsed?.chartsTo === 'string' && parsed.chartsTo) setChartsTo(parsed.chartsTo)
      }
    } catch {}
  }, [currentProject?.id])

  useEffect(() => {
    const key = `${currentProject?.id || 'global'}:tasks-view`
    try {
			localStorage.setItem(key, JSON.stringify({ subView, calendarMode, calendarDate, statusFilter, tagsFilter, todoShowCompleted: showCompleted, chartsFrom, chartsTo }))
    } catch {}
	}, [subView, calendarMode, calendarDate, statusFilter, tagsFilter, showCompleted, chartsFrom, chartsTo, currentProject?.id])

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
      if (threadsSettings.completedColumnId) {
        setCompletedColumnId(threadsSettings.completedColumnId)
      } else {
        const done = (threadsSettings.columns || []).find((c: any) => /done|complete/i.test(c.title))
        if (done) setCompletedColumnId(done.id)
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

  // To-Do view derived lists
  const todayTasks = useMemo(() => {
    const selected = selectedDay
    const flatten: VerbweaverNode[] = []
    Object.values(tasksByStatus).forEach(arr => arr.forEach(t => flatten.push(t)))
    return flatten
      .filter(t => !!t.metadata?.task?.dueDate && (t.metadata.task.dueDate === selected))
      .filter(t => (showCompleted ? true : !isTaskCompleted(t)))
      .filter(t => {
        if (statusFilter && statusFilter.length > 0) {
          const status = t.taskStatus || t.metadata?.task?.status || defaultColumnId || 'todo'
          if (!statusFilter.includes(status)) return false
        }
        if (tagsFilter && tagsFilter.length > 0) {
          const tags = (t.metadata?.tags || []) as string[]
          if (!tags.some(tag => tagsFilter.includes(tag))) return false
        }
        return true
      })
  }, [tasksByStatus, selectedDay, completedColumnId, statusFilter, tagsFilter, defaultColumnId, showCompleted])

  const overdueTasks = useMemo(() => {
    const compareDate = relativeToSelected ? selectedDay : formatLocalYMD(new Date())
    const flatten: VerbweaverNode[] = []
    Object.values(tasksByStatus).forEach(arr => arr.forEach(t => flatten.push(t)))
    const filtered = flatten
      .filter(t => !!t.metadata?.task?.dueDate && t.metadata.task.dueDate < compareDate)
      .filter(t => (showCompleted ? true : !isTaskCompleted(t)))
      .filter(t => {
        if (statusFilter && statusFilter.length > 0) {
          const status = t.taskStatus || t.metadata?.task?.status || defaultColumnId || 'todo'
          if (!statusFilter.includes(status)) return false
        }
        if (tagsFilter && tagsFilter.length > 0) {
          const tags = (t.metadata?.tags || []) as string[]
          if (!tags.some(tag => tagsFilter.includes(tag))) return false
        }
        return true
      })
    return filtered.sort((a, b) => {
      const da = a.metadata.task.dueDate
      const db = b.metadata.task.dueDate
      return overdueSortDesc ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [tasksByStatus, selectedDay, relativeToSelected, completedColumnId, statusFilter, tagsFilter, defaultColumnId, overdueSortDesc, showCompleted])

  const sevenDayStrip = useMemo(() => {
    const base = parseLocalYMD(selectedDay)
    const days: { key: string; label: string }[] = []
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      const key = formatLocalYMD(d)
      const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
      days.push({ key, label })
    }
    return days
  }, [selectedDay])

  // --------- Charts (Gantt & Burndown) ---------
  const filteredTaskList = useMemo(() => {
    const list: VerbweaverNode[] = []
    Object.values(tasksByStatus).forEach(arr => arr.forEach(t => list.push(t)))
    return list.filter(t => {
      const status = t.taskStatus || t.metadata?.task?.status || defaultColumnId || 'todo'
      if (statusFilter && statusFilter.length > 0 && !statusFilter.includes(status)) return false
      if (tagsFilter && tagsFilter.length > 0) {
        const tags = (t.metadata?.tags || []) as string[]
        if (!tags.some(tag => tagsFilter.includes(tag))) return false
      }
      return true
    })
  }, [tasksByStatus, statusFilter, tagsFilter, defaultColumnId])

	const ganttData = useMemo(() => {
    // Prepare tasks with start and end dates
    type Row = { title: string; start: string; end: string; status?: string }
		const rows: Row[] = []
		// Filter tasks by charts date range (intersection)
		const intersectsRange = (start?: string, end?: string) => {
			if (!start && !end) return false
			const s = start || end!
			const e = end || start!
			if (chartsFrom && e < chartsFrom) return false
			if (chartsTo && s > chartsTo) return false
			return true
		}
		for (const t of filteredTaskList) {
      const md = (t.metadata?.task || {}) as any
      const due = md.dueDate as string | undefined
      const start = md.startDate as string | undefined
			if (!intersectsRange(start, due)) continue
      const s = start || due!
      const e = due || start!
      rows.push({ title: t.metadata?.title || t.name, start: s, end: e, status: t.taskStatus || md.status })
    }
    if (rows.length === 0) return { rows, min: '', max: '' }
		const dates = rows.flatMap(r => [r.start, r.end]).filter(Boolean) as string[]
		let min = dates.reduce((a, b) => (a < b ? a : b))
		let max = dates.reduce((a, b) => (a > b ? a : b))
		// Clamp domain to selected range if provided
		if (chartsFrom && chartsFrom > min) min = chartsFrom
		if (chartsTo && chartsTo < max) max = chartsTo
    return { rows, min, max }
	}, [filteredTaskList, chartsFrom, chartsTo])

	const burndownData = useMemo(() => {
    // Simple burndown: remaining tasks per day between min(start) and max(due)
		// Consider only tasks intersecting selected charts range
		const rawTasks = filteredTaskList.map(t => ({
      start: (t.metadata?.task?.startDate as string | undefined) || (t.metadata?.task?.dueDate as string | undefined) || undefined,
      due: t.metadata?.task?.dueDate as string | undefined,
      completed: !!t.metadata?.task?.completedDate,
      completedDate: t.metadata?.task?.completedDate as string | undefined,
    }))
		const tasks = rawTasks.filter(t => {
			if (!t.start && !t.due) return false
			const s = t.start || t.due!
			const e = t.due || t.start!
			if (chartsFrom && e < chartsFrom) return false
			if (chartsTo && s > chartsTo) return false
			return true
		})
    const allDates = tasks.flatMap(t => [t.start, t.due].filter(Boolean) as string[])
    if (allDates.length === 0) return { labels: [] as string[], values: [] as number[] }
		let min = allDates.reduce((a, b) => (a < b ? a : b))
		let max = allDates.reduce((a, b) => (a > b ? a : b))
		if (chartsFrom && chartsFrom > min) min = chartsFrom
		if (chartsTo && chartsTo < max) max = chartsTo
		const startDate = new Date(min)
		const endDate = new Date(max)
    const labels: string[] = []
    const values: number[] = []
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${da}`
      labels.push(key)
      let remaining = 0
      for (const t of tasks) {
        const started = !t.start || t.start <= key
        const notDoneYet = !t.completed || (t.completedDate! > key)
        if (started && notDoneYet) remaining++
      }
      values.push(remaining)
    }
    return { labels, values }
	}, [filteredTaskList, chartsFrom, chartsTo])

  const drawGantt = useCallback(() => {
    const canvas = ganttCanvasRef.current
    if (!canvas) return
    const { rows, min, max } = ganttData
    const ctx = canvas.getContext('2d')!
    const DPR = window.devicePixelRatio || 1
    const width = 900, rowH = 22
    const height = Math.max(150, rows.length * rowH + 30)
    canvas.width = width * DPR
    canvas.height = height * DPR
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(DPR, DPR)
    ctx.clearRect(0, 0, width, height)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb'

    if (!min || !max) {
      ctx.fillText('No dated tasks to display', 12, 20)
      return
    }
    const minD = new Date(min)
    const maxD = new Date(max)
    const totalDays = Math.max(1, Math.ceil((+maxD - +minD) / 86400000))
    const leftPad = 160
    const chartW = width - leftPad - 20
    // grid
<<<<<<< HEAD
    ctx.strokeStyle = '#444'
=======
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border')})` : '#444'
>>>>>>> release-testing
    ctx.lineWidth = 1
    for (let i = 0; i <= totalDays; i++) {
      const x = leftPad + (i * chartW) / totalDays
      ctx.beginPath()
      ctx.moveTo(x, 10)
      ctx.lineTo(x, height - 10)
      ctx.stroke()
    }
    // rows
    rows.forEach((r, idx) => {
      const y = 20 + idx * rowH
      // label
<<<<<<< HEAD
      ctx.fillStyle = '#bbb'
=======
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground')})` : '#bbb'
>>>>>>> release-testing
      ctx.fillText(r.title, 8, y + 12)
      // bar
      const s = new Date(r.start)
      const e = new Date(r.end)
      const sx = leftPad + ((+s - +minD) / (86400000 * totalDays)) * chartW
      const ex = leftPad + ((+e - +minD) / (86400000 * totalDays)) * chartW
      const w = Math.max(6, ex - sx)
<<<<<<< HEAD
      ctx.fillStyle = '#3b82f6'
=======
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--primary')})` : '#3b82f6'
>>>>>>> release-testing
      ctx.fillRect(sx, y, w, 12)
    })
  }, [ganttData])

  const drawBurndown = useCallback(() => {
    const canvas = burndownCanvasRef.current
    if (!canvas) return
    const { labels, values } = burndownData
    const ctx = canvas.getContext('2d')!
    const DPR = window.devicePixelRatio || 1
    const width = 900, height = 220
    canvas.width = width * DPR
    canvas.height = height * DPR
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(DPR, DPR)
    ctx.clearRect(0, 0, width, height)
    ctx.font = '12px sans-serif'
<<<<<<< HEAD
    ctx.fillStyle = '#bbb'
=======
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground')})` : '#bbb'
>>>>>>> release-testing
    if (labels.length === 0) {
      ctx.fillText('No tasks with dates to chart', 12, 20)
      return
    }
    const leftPad = 40, rightPad = 10, topPad = 10, bottomPad = 20
    const chartW = width - leftPad - rightPad
    const chartH = height - topPad - bottomPad
    const maxY = Math.max(1, ...values)
    // axes
<<<<<<< HEAD
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(leftPad, topPad); ctx.lineTo(leftPad, height - bottomPad); ctx.lineTo(width - rightPad, height - bottomPad); ctx.stroke()
    // data line
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2
=======
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border')})` : '#444'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(leftPad, topPad); ctx.lineTo(leftPad, height - bottomPad); ctx.lineTo(width - rightPad, height - bottomPad); ctx.stroke()
    // data line
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--secondary')})` : '#10b981'; ctx.lineWidth = 2
>>>>>>> release-testing
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = leftPad + (i * chartW) / Math.max(1, values.length - 1)
      const y = topPad + chartH - (v / maxY) * chartH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // ideal line
<<<<<<< HEAD
    ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([4, 4])
=======
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--accent')})` : '#f59e0b'; ctx.setLineDash([4, 4])
>>>>>>> release-testing
    ctx.beginPath()
    for (let i = 0; i < values.length; i++) {
      const x = leftPad + (i * chartW) / Math.max(1, values.length - 1)
      const y = topPad + chartH - ((maxY - (maxY * i) / (values.length - 1)) / maxY) * chartH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke(); ctx.setLineDash([])
  }, [burndownData])

  useEffect(() => {
    if (subView === 'charts') {
      drawGantt(); drawBurndown()
    }
  }, [subView, drawGantt, drawBurndown])

  const exportCanvas = (ref: React.RefObject<HTMLCanvasElement>, filename: string) => {
    const cnv = ref.current
    if (!cnv) return
    const link = document.createElement('a')
    link.download = filename
    link.href = cnv.toDataURL('image/png')
    link.click()
  }

  const handleToggleComplete = async (node: VerbweaverNode, complete: boolean) => {
    if (!currentProject) return
    if (complete) {
      const today = formatLocalYMD(new Date())
      const statusId = effectiveCompletedId || 'done'
      setOptimisticCompleted(prev => {
        const next = new Set(prev)
        next.add(node.path)
        return next
      })
      try {
        const fresh = useNodeStore.getState().nodes.get(node.path)
        const currentTask = fresh?.metadata?.task || {}
        const updatedTask = { ...currentTask, status: statusId, completedDate: today }
        await useNodeStore.getState().updateNode(node.path, { metadata: { task: updatedTask } as any })
      } catch (e) {
        console.error('Failed to mark complete', e)
      }
      try {
        await loadNodes()
      } finally {
        setOptimisticCompleted(prev => {
          const next = new Set(prev)
          next.delete(node.path)
          return next
        })
      }
    } else {
      // Open dialog to pick target column; default to defaultColumnId
      setUncompleteTarget(defaultColumnId)
      setUncompleteDialog({ open: true, nodePath: node.path })
    }
  }

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

    const nodePath = String(active.id)
    const node = useNodeStore.getState().nodes.get(nodePath)
    if (!node) return

    // Determine previous status for comparison
    const prevStatus = (node.taskStatus || (node.metadata?.task?.status as string) || defaultColumnId || columns[0]?.id || 'todo') as string

    // Determine target column id robustly
    let targetColumnId: string | null = null
    const overData: any = (over as any)?.data?.current
    const sortable = overData?.sortable
    if (sortable?.containerId) {
      targetColumnId = String(sortable.containerId)
    } else {
      targetColumnId = String(over.id)
    }

    // If over.id is actually a task id (node path), infer its containing column
    if (targetColumnId && !columns.some(c => c.id === targetColumnId)) {
      for (const col of columns) {
        const list = getTasksByStatus(col.id)
        if (list.some(t => t.path === targetColumnId)) {
          targetColumnId = col.id
          break
        }
      }
    }

    // If target is still unknown or invalid, do nothing
    if (!targetColumnId || !columns.some(c => c.id === targetColumnId)) return

    // No-op if dropping back into the same column
    if (targetColumnId === prevStatus) return

    updateTaskStatus(nodePath, targetColumnId as TaskState)
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
        <div className="grid items-start gap-2 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your project tasks and track progress. Every node in your project is a task.
            </p>
          </div>
          
          <div className="flex items-center gap-2 justify-self-end">
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
              <button
                onClick={() => setSubView('todo')}
                className={clsx(
                  'px-3 py-1.5 text-sm flex items-center gap-1 border-l border-border',
                  subView === 'todo' ? 'bg-primary text-primary-foreground' : 'bg-background'
                )}
                title="To-Do"
              >
                <CheckSquare className="w-4 h-4" /> To-Do
              </button>
              <button
                onClick={() => setSubView('charts')}
                className={clsx(
                  'px-3 py-1.5 text-sm flex items-center gap-1 border-l border-border',
                  subView === 'charts' ? 'bg-primary text-primary-foreground' : 'bg-background'
                )}
                title="Charts"
              >
                <BarChart2 className="w-4 h-4" /> Charts
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
            {subView === 'calendar' && (null)}
            {subView === 'todo' && (
              <>
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="px-3 py-1.5 rounded border border-border text-sm hover:bg-accent inline-flex items-center gap-2"
                  title="Filters"
                >
                  <Filter className="w-4 h-4" /> Filters
                </button>
                <button
                  onClick={() => { setSelectedColumn('todo' as any); setDefaultDue(selectedDay); setIsCreateModalOpen(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </button>
                <button
                  onClick={() => setShowUnscheduled(s => !s)}
                  className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
                >
                  {showUnscheduled ? 'Hide Unscheduled' : 'Show Unscheduled'}
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
            {subView === 'calendar' ? (
              <div className="flex-1 overflow-auto p-2">
                {/* Calendar subheader controls */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const api = calendarRef.current?.getApi?.(); api?.prev() }}
                      className="p-2 rounded hover:bg-accent"
                      title="Previous"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { const api = calendarRef.current?.getApi?.(); api?.today() }}
                      className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { const api = calendarRef.current?.getApi?.(); api?.next() }}
                      className="p-2 rounded hover:bg-accent"
                      title="Next"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      <button
                        onClick={() => { setCalendarMode('month'); calendarRef.current?.getApi?.().changeView('dayGridMonth') }}
                        className={clsx('px-3 py-1.5 text-sm', calendarMode==='month' ? 'bg-accent' : '')}
                      >Month</button>
                      <button
                        onClick={() => { setCalendarMode('week'); calendarRef.current?.getApi?.().changeView('dayGridWeek') }}
                        className={clsx('px-3 py-1.5 text-sm border-l border-border', calendarMode==='week' ? 'bg-accent' : '')}
                      >Week</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                  </div>
                </div>
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
            ) : subView === 'todo' ? (
              // To-Do view
              <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
                {/* Seven-day strip */}
                <div className="flex items-center justify-center gap-2">
                  <button className="p-1.5 rounded hover:bg-accent" onClick={() => {
                    const d = parseLocalYMD(selectedDay); d.setDate(d.getDate() - 1); setSelectedDay(formatLocalYMD(d))
                  }}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {sevenDayStrip.map(d => (
                    <button key={d.key} onClick={() => setSelectedDay(d.key)} className={clsx('px-2 py-1 rounded text-sm', d.key === selectedDay ? 'bg-primary text-primary-foreground' : 'bg-background border border-border')}>
                      {d.label}
                    </button>
                  ))}
                  <button className="p-1.5 rounded hover:bg-accent" onClick={() => {
                    const d = parseLocalYMD(selectedDay); d.setDate(d.getDate() + 1); setSelectedDay(formatLocalYMD(d))
                  }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={relativeToSelected} onChange={(e)=>setRelativeToSelected(e.target.checked)} /> Overdue relative to selected day</label>
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={overdueSortDesc} onChange={(e)=>setOverdueSortDesc(e.target.checked)} /> Sort overdue newest first</label>
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={showCompleted} onChange={(e)=>setShowCompleted(e.target.checked)} /> View Completed</label>
                  </div>
                  <Button onClick={() => setIsColumnManagerOpen(true)} variant="outline" size="sm" className="flex items-center gap-2"><Settings className="w-4 h-4" /> Manage Statuses</Button>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
                  {/* Overdue */}
                  <div className="border border-border rounded p-2 flex flex-col overflow-hidden">
                    <h3 className="text-sm font-medium mb-2">Overdue Tasks</h3>
                    <div className="flex-1 overflow-auto space-y-2" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{
                      const path = e.dataTransfer.getData('text/task-path');
                      if (path) {
                        // Clear due date when dropped into overdue panel? Keep as is; do nothing
                      }
                    }}>
                      {overdueTasks.map(t => (
                        <div key={t.path} className={clsx("p-2 rounded border border-border flex items-center justify-between", isTaskCompleted(t) && "opacity-60") }>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={optimisticCompleted.has(t.path) || isTaskCompleted(t)}
                              onChange={(e)=>handleToggleComplete(t, e.target.checked)}
                            />
                            <span className={clsx("cursor-pointer", isTaskCompleted(t) && "line-through")} onClick={()=>handleTaskClick(t)}>{t.metadata?.title || t.name}</span>
                          </label>
                          <span className="text-xs text-muted-foreground">{t.metadata.task.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Today */}
                  <div className="border border-border rounded p-2 flex flex-col overflow-hidden" onDragOver={(e)=>e.preventDefault()} onDrop={async (e)=>{
                    const path = e.dataTransfer.getData('text/task-path');
                    if (path) {
                      const updated = { ...(useNodeStore.getState().nodes.get(path)?.metadata.task || {}), dueDate: selectedDay }
                      await useNodeStore.getState().updateNode(path, { metadata: { task: updated } as any })
                      try { await useNodeStore.getState().loadNodes() } catch {}
                    }
                  }}>
                    <h3 className="text-sm font-medium mb-2">Today's Tasks</h3>
                    <div className="flex-1 overflow-auto space-y-2">
                      {todayTasks.map(t => (
                        <div key={t.path} className={clsx("p-2 rounded border border-border flex items-center justify-between", isTaskCompleted(t) && "opacity-60")} draggable onDragStart={(e)=>{ e.dataTransfer.setData('text/task-path', t.path) }}>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={optimisticCompleted.has(t.path) || isTaskCompleted(t)}
                              onChange={(e)=>handleToggleComplete(t, e.target.checked)}
                            />
                            <span className={clsx("cursor-pointer", isTaskCompleted(t) && "line-through")} onClick={()=>handleTaskClick(t)}>{t.metadata?.title || t.name}</span>
                          </label>
                          <span className="text-xs text-muted-foreground">{t.metadata.task.dueDate}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Drag from Unscheduled to add to selected day. Drag a task out to Unscheduled to remove date.</div>
                  </div>
                </div>
              </div>
            ) : (
				// Charts view
				<div className="flex-1 p-3 overflow-auto flex flex-col gap-4">
					{/* Charts controls */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<label className="text-sm">Date Range</label>
							<div className="relative">
								<CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<input
									type="date"
									className="pl-8 pr-2 py-1 w-40 rounded border border-border text-sm bg-background"
									value={chartsFrom || ''}
									onClick={(e)=>{ const el = e.currentTarget as HTMLInputElement; (el as any).showPicker?.() }}
									onChange={(e)=> setChartsFrom(e.target.value ? e.target.value : null)}
								/>
							</div>
							<span className="text-sm text-muted-foreground">to</span>
							<div className="relative">
								<CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<input
									type="date"
									className="pl-8 pr-2 py-1 w-40 rounded border border-border text-sm bg-background"
									value={chartsTo || ''}
									onClick={(e)=>{ const el = e.currentTarget as HTMLInputElement; (el as any).showPicker?.() }}
									onChange={(e)=> setChartsTo(e.target.value ? e.target.value : null)}
								/>
							</div>
							<button
								className="px-2 py-1 rounded border border-border text-sm hover:bg-accent"
								onClick={()=>{ setChartsFrom(null); setChartsTo(null) }}
							>
								Clear
							</button>
						</div>
					</div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Gantt Chart</h3>
                  <button className="px-2 py-1 text-xs rounded border border-border hover:bg-accent" onClick={() => exportCanvas(ganttCanvasRef, 'gantt.png')}>Export PNG</button>
                </div>
                <canvas ref={ganttCanvasRef} className="border border-border rounded" />
                <div className="flex items-center justify-between mt-2">
                  <h3 className="text-sm font-medium">Burndown Chart</h3>
                  <button className="px-2 py-1 text-xs rounded border border-border hover:bg-accent" onClick={() => exportCanvas(burndownCanvasRef, 'burndown.png')}>Export PNG</button>
                </div>
                <canvas ref={burndownCanvasRef} className="border border-border rounded" />
              </div>
            )}
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
                        draggable
                        onDragStart={(e)=>{ e.dataTransfer.setData('text/task-path', n.path) }}
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
              completedColumnId={completedColumnId}
              onColumnsChange={handleColumnsChange}
              onDefaultChange={handleDefaultChange}
              onCompletedChange={async (val) => {
                setCompletedColumnId(val)
                if (currentProject) {
                  try {
                    await projectsApi.updateTasksSettings(currentProject.id, { columns, defaultColumnId, completedColumnId: val })
                  } catch (err) {
                    console.warn('Failed to save completed column', err)
                  }
                }
              }}
              onClose={() => setIsColumnManagerOpen(false)}
            />
      )}
      {/* Un-complete confirmation dialog */}
      {uncompleteDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setUncompleteDialog({ open: false })}>
          <div className="bg-background border border-border rounded-lg w-full max-w-md p-6" onClick={(e)=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Mark task as not completed?</h3>
            <p className="text-sm text-muted-foreground mb-3">Pick a status to move the task to.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Move to status</label>
              <select className="w-full px-2 py-1 border border-input rounded bg-background text-sm" value={uncompleteTarget} onChange={(e)=>setUncompleteTarget(e.target.value)}>
                {columns.map(c => (<option key={c.id} value={c.id}>{c.title}</option>))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded border border-border" onClick={()=>setUncompleteDialog({ open: false })}>Cancel</button>
              <button className="px-3 py-1.5 rounded bg-primary text-primary-foreground" onClick={async ()=>{
                const path = uncompleteDialog.nodePath
                setUncompleteDialog({ open: false })
                if (!path) return
                try {
                  const fresh = useNodeStore.getState().nodes.get(path)
                  const currentTask = fresh?.metadata?.task || {}
                  const updatedTask = { ...currentTask, status: uncompleteTarget as TaskState, completedDate: undefined }
                  await useNodeStore.getState().updateNode(path, { metadata: { task: updatedTask } as any })
                  await loadNodes()
                } catch (e) {
                  console.error('Failed to un-complete task', e)
                }
              }}>Confirm</button>
            </div>
          </div>
        </div>
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