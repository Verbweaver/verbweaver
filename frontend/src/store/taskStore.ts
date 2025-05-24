import { create } from 'zustand'
import { api } from '../services/auth'
import { Task, TaskStatus } from '@verbweaver/shared'
import toast from 'react-hot-toast'

// Task API client
const taskApi = {
  async getTasks(projectId: number): Promise<Task[]> {
    const response = await api.get(`/projects/${projectId}/tasks`)
    return response.data
  },
  
  async getTask(projectId: number, taskId: string): Promise<Task> {
    const response = await api.get(`/projects/${projectId}/tasks/${taskId}`)
    return response.data
  },
  
  async createTask(projectId: number, task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const response = await api.post(`/projects/${projectId}/tasks`, task)
    return response.data
  },
  
  async updateTask(projectId: number, taskId: string, updates: Partial<Task>): Promise<Task> {
    const response = await api.put(`/projects/${projectId}/tasks/${taskId}`, updates)
    return response.data
  },
  
  async deleteTask(projectId: number, taskId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/tasks/${taskId}`)
  },

  async moveTask(projectId: number, taskId: string, status: TaskStatus): Promise<void> {
    await api.patch(`/projects/${projectId}/tasks/${taskId}/move`, { status })
  }
}

interface TaskState {
  tasks: {
    'todo': Task[]
    'in_progress': Task[]
    'review': Task[]
    'done': Task[]
  }
  selectedTask: Task | null
  isLoading: boolean
  isCreating: boolean
  error: string | null
  
  loadTasks: (projectId: number) => Promise<void>
  createTask: (projectId: number, task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTask: (projectId: number, taskId: string, updates: Partial<Task>) => Promise<void>
  updateTaskStatus: (projectId: number, taskId: string, status: TaskStatus) => Promise<void>
  deleteTask: (projectId: number, taskId: string) => Promise<void>
  moveTask: (projectId: number, taskId: string, status: TaskStatus) => Promise<void>
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {
    'todo': [],
    'in_progress': [],
    'review': [],
    'done': []
  },
  selectedTask: null,
  isLoading: false,
  isCreating: false,
  error: null,

  loadTasks: async (projectId: number) => {
    set({ isLoading: true, error: null })
    
    try {
      const tasks = await taskApi.getTasks(projectId)
      
      // Group tasks by status
      const groupedTasks = {
        'todo': tasks.filter((t: Task) => t.status === 'todo'),
        'in_progress': tasks.filter((t: Task) => t.status === 'in_progress'),
        'review': tasks.filter((t: Task) => t.status === 'review'),
        'done': tasks.filter((t: Task) => t.status === 'done')
      }
      
      set({ tasks: groupedTasks, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to load tasks', isLoading: false })
    }
  },

  createTask: async (projectId: number, taskData) => {
    set({ isLoading: true })
    
    try {
      const newTask = await taskApi.createTask(projectId, taskData)
      set(state => ({
        tasks: {
          ...state.tasks,
          'todo': [...state.tasks['todo'], newTask]
        },
        isLoading: false
      }))
      toast.success('Task created')
    } catch (error) {
      toast.error('Failed to create task')
      set({ isLoading: false })
    }
  },

  updateTask: async (projectId: number, taskId: string, updates: Partial<Task>) => {
    try {
      const updatedTask = await taskApi.updateTask(projectId, taskId, updates)
      set(state => ({
        tasks: {
          'todo': state.tasks['todo'].map(t => t.id === taskId ? updatedTask : t),
          'in_progress': state.tasks['in_progress'].map(t => t.id === taskId ? updatedTask : t),
          'review': state.tasks['review'].map(t => t.id === taskId ? updatedTask : t),
          'done': state.tasks['done'].map(t => t.id === taskId ? updatedTask : t)
        }
      }))
    } catch (error) {
      toast.error('Failed to update task')
    }
  },

  updateTaskStatus: async (projectId: number, taskId: string, status: TaskStatus) => {
    const state = useTaskStore.getState()
    
    // Find the task
    let task: Task | null = null
    let oldStatus: string | null = null
    
    for (const [statusKey, tasks] of Object.entries(state.tasks)) {
      const found = tasks.find((t: Task) => t.id === taskId)
      if (found) {
        task = found
        oldStatus = statusKey
        break
      }
    }
    
    if (!task || !oldStatus) return
    
    // Optimistic update
    set(state => ({
      tasks: {
        ...state.tasks,
        [oldStatus]: state.tasks[oldStatus as keyof typeof state.tasks].filter((t: Task) => t.id !== taskId),
        [status]: [...state.tasks[status as keyof typeof state.tasks], { ...task, status }]
      }
    }))
    
    try {
      await taskApi.updateTask(projectId, taskId, { status })
    } catch (error) {
      // Revert on error
      set(state => ({
        tasks: {
          ...state.tasks,
          [status]: state.tasks[status as keyof typeof state.tasks].filter((t: Task) => t.id !== taskId),
          [oldStatus]: [...state.tasks[oldStatus as keyof typeof state.tasks], task]
        }
      }))
      toast.error('Failed to update task status')
    }
  },

  deleteTask: async (projectId: number, taskId: string) => {
    try {
      await taskApi.deleteTask(projectId, taskId)
      set(state => ({
        tasks: {
          'todo': state.tasks['todo'].filter(t => t.id !== taskId),
          'in_progress': state.tasks['in_progress'].filter(t => t.id !== taskId),
          'review': state.tasks['review'].filter(t => t.id !== taskId),
          'done': state.tasks['done'].filter(t => t.id !== taskId)
        }
      }))
      toast.success('Task deleted')
    } catch (error) {
      toast.error('Failed to delete task')
    }
  },

  moveTask: async (projectId: number, taskId: string, status: TaskStatus) => {
    const state = useTaskStore.getState()
    
    // Find the task in all columns
    let task: Task | null = null
    let oldStatus: string | null = null
    
    for (const [statusKey, tasks] of Object.entries(state.tasks)) {
      const found = tasks.find((t: Task) => t.id === taskId)
      if (found) {
        task = found
        oldStatus = statusKey
        break
      }
    }
    
    if (!task || !oldStatus) return
    
    // Optimistic update
    set(state => ({
      tasks: {
        ...state.tasks,
        [oldStatus]: state.tasks[oldStatus as keyof typeof state.tasks].filter((t: Task) => t.id !== taskId),
        [status]: [...state.tasks[status as keyof typeof state.tasks], { ...task, status }]
      }
    }))
    
    try {
      await taskApi.moveTask(projectId, taskId, status)
    } catch (error) {
      // Revert on error
      set(state => ({
        tasks: {
          ...state.tasks,
          [status]: state.tasks[status as keyof typeof state.tasks].filter((t: Task) => t.id !== taskId),
          [oldStatus]: [...state.tasks[oldStatus as keyof typeof state.tasks], task]
        }
      }))
      toast.error('Failed to move task')
    }
  }
})) 