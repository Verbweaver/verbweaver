// Task types
export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: Date
  assignee?: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done'
}

// WebSocket event types
export enum WebSocketEventType {
  // User events
  USER_JOIN = 'USER_JOIN',
  USER_LEAVE = 'USER_LEAVE',
  
  // Cursor events
  CURSOR_MOVE = 'CURSOR_MOVE',
  
  // Node events
  NODE_CREATE = 'NODE_CREATE',
  NODE_UPDATE = 'NODE_UPDATE',
  NODE_DELETE = 'NODE_DELETE',
  
  // Edge events
  EDGE_CREATE = 'EDGE_CREATE',
  EDGE_DELETE = 'EDGE_DELETE',
  
  // File events
  FILE_UPDATE = 'FILE_UPDATE',
  
  // Task events
  TASK_CREATE = 'TASK_CREATE',
  TASK_UPDATE = 'TASK_UPDATE',
  TASK_MOVE = 'TASK_MOVE',
  TASK_DELETE = 'TASK_DELETE',
  
  // Comment events
  COMMENT_CREATE = 'COMMENT_CREATE',
  
  // Typing events
  TYPING_START = 'TYPING_START',
  TYPING_STOP = 'TYPING_STOP'
} 