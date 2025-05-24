import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'
import { Plus, MoreHorizontal, Calendar, User } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useTaskStore } from '../store/taskStore'
import { TASK_STATES, TaskStatus } from '@verbweaver/shared'
import TaskCard from '../components/tasks/TaskCard'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import clsx from 'clsx'

const columns = [
  { id: TASK_STATES.TODO, title: 'To Do', color: 'bg-gray-500' },
  { id: TASK_STATES.IN_PROGRESS, title: 'In Progress', color: 'bg-blue-500' },
  { id: TASK_STATES.REVIEW, title: 'Review', color: 'bg-amber-500' },
  { id: TASK_STATES.DONE, title: 'Done', color: 'bg-green-500' },
]

function ThreadsView() {
  const { currentProject } = useProjectStore()
  const { tasks, loadTasks, updateTaskStatus, isLoading } = useTaskStore()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)

  useEffect(() => {
    if (currentProject) {
      loadTasks(parseInt(currentProject.id))
    }
  }, [currentProject, loadTasks])

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !currentProject) return

    const taskId = result.draggableId
    const newStatus = result.destination.droppableId as TaskStatus

    updateTaskStatus(parseInt(currentProject.id), taskId, newStatus)
  }

  const getTasksByStatus = (status: string) => {
    return tasks[status as keyof typeof tasks] || []
  }

  const handleCreateTask = (columnId: string) => {
    setSelectedColumn(columnId)
    setIsCreateModalOpen(true)
  }

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
            onClick={() => handleCreateTask(TASK_STATES.TODO)}
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
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-4 h-full">
                {columns.map(column => (
                  <div
                    key={column.id}
                    className="flex-1 min-w-[300px] flex flex-col bg-muted/30 rounded-lg"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <div className="flex items-center gap-2">
                        <div className={clsx('w-3 h-3 rounded-full', column.color)} />
                        <h3 className="font-semibold">{column.title}</h3>
                        <span className="text-sm text-muted-foreground">
                          {getTasksByStatus(column.id).length}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => handleCreateTask(column.id)}
                        className="p-1 rounded hover:bg-accent"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Column Content */}
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={clsx(
                            'flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin',
                            snapshot.isDraggingOver && 'bg-accent/20'
                          )}
                        >
                          {getTasksByStatus(column.id).map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}
                                >
                                  <TaskCard
                                    task={task}
                                    isDragging={snapshot.isDragging}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <CreateTaskModal
          projectId={currentProject.id}
          defaultStatus={selectedColumn || TASK_STATES.TODO}
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