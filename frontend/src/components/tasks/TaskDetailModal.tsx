import { useState, useEffect } from 'react'
import { X, Send, Paperclip, Link, User, Calendar, Tag, MessageSquare, Edit3, Download, Trash2, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNodeStore } from '../../store/nodeStore'
import { useTabStore } from '../../store/tabStore'
import { TaskState } from '@verbweaver/shared'
import { FileStorage, StoredFile } from '../../utils/fileStorage'
import clsx from 'clsx'
import { KanbanColumn } from './ColumnManager'
import toast from 'react-hot-toast'

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

interface Comment {
  id: string
  author: string
  content: string
  timestamp: Date
}

interface TaskDetailModalProps {
  node: VerbweaverNode | null
  onClose: () => void
  onUpdate: (node: VerbweaverNode) => void
  availableStatuses?: string[]
  columns?: KanbanColumn[]
}

function TaskDetailModal({ node, onClose, onUpdate, availableStatuses, columns }: TaskDetailModalProps) {
  const { updateNode, getNode } = useNodeStore()
  const { addEditorTab } = useTabStore()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [status, setStatus] = useState('todo')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [newComment, setNewComment] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<StoredFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isCreateLinkModalOpen, setIsCreateLinkModalOpen] = useState(false)

  useEffect(() => {
    if (node) {
      const task = node.metadata.task || {}
      setTitle(node.metadata.title || node.name)
      setDescription(node.metadata.description || '')
      setPriority(task.priority || node.metadata.priority || 'medium')
      setStatus(node.taskStatus || task.status || 'todo')
      setAssignee(task.assignee || node.metadata.assignee || '')
      setDueDate(task.dueDate || node.metadata.dueDate || '')
      setTags(node.metadata.tags || [])
      setComments(task.comments || [])
      
      // Handle file migration from old format
      const oldFiles = task.files || []
      const migratedFiles = oldFiles.map((file: any) => {
        const migrated = FileStorage.migrateOldFileFormat(file)
        if (migrated) {
          return migrated
        } else {
          // Create a placeholder for old files that can't be recovered
          return {
            id: file.id || `old_${Date.now()}`,
            name: file.name || 'Unknown File',
            originalName: file.originalName || file.name || 'Unknown File',
            size: file.size || 0,
            uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
            uploadedBy: file.uploadedBy || 'Unknown User',
            path: '', // Empty path indicates this file cannot be downloaded
            mimeType: file.mimeType || 'application/octet-stream'
          } as StoredFile
        }
      })
      setFiles(migratedFiles)
    }
  }, [node])

  const handleSave = async () => {
    if (!node) return

    const updatedMetadata = {
      ...node.metadata,
      title,
      description,
      priority,
      assignee,
      dueDate,
      tags,
      task: {
        ...node.metadata.task,
        status,
        priority,
        assignee,
        dueDate,
        comments,
        files
      }
    }

    await updateNode(node.path, { metadata: updatedMetadata })
    
    // Create updated node with new taskStatus
    const updatedNode = { 
      ...node, 
      metadata: updatedMetadata,
      taskStatus: status as TaskState // Update the taskStatus directly
    }
    
    onUpdate(updatedNode)
    
    // Update local state to reflect the new status immediately
    setStatus(status)
    setIsEditing(false)
  }

  const handleAddComment = () => {
    if (!newComment.trim()) return

    const comment: Comment = {
      id: Date.now().toString(),
      author: 'Current User', // TODO: Get from auth context
      content: newComment,
      timestamp: new Date()
    }

    setComments([...comments, comment])
    setNewComment('')
  }

  const handleAddTag = () => {
    if (!newTag.trim() || tags.includes(newTag.trim())) return
    setTags([...tags, newTag.trim()])
    setNewTag('')
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || !node) return

    setIsUploading(true)
    try {
      const newFiles: StoredFile[] = []
      
      for (const file of Array.from(uploadedFiles)) {
        const storedFile = await FileStorage.uploadFile(file, node.path)
        if (storedFile) {
          newFiles.push(storedFile)
        }
      }
      
      setFiles([...files, ...newFiles])
    } catch (error) {
      console.error('Failed to upload files:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownloadFile = async (storedFile: StoredFile) => {
    try {
      // Check if file has a valid path
      if (!storedFile.path) {
        alert('This file was uploaded with an older version and cannot be downloaded. Please re-upload the file.')
        return
      }
      
      await FileStorage.downloadFile(storedFile)
    } catch (error) {
      console.error('Failed to download file:', error)
      alert('Failed to download file. Please try again.')
    }
  }

  const handleRemoveFile = async (fileToRemove: StoredFile) => {
    try {
      const success = await FileStorage.deleteFile(fileToRemove)
      if (success) {
        setFiles(files.filter(file => file.id !== fileToRemove.id))
      }
    } catch (error) {
      console.error('Failed to remove file:', error)
    }
  }

  const handleOpenInEditor = () => {
    if (node) {
      const tabId = addEditorTab(node.path, node.name)
      // Set the new tab as active
      useTabStore.getState().setActiveTab(tabId)
      navigate(`/editor/${encodeURIComponent(node.path)}`) // Navigate to the editor path
      onClose() // Close the modal after opening the editor
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500'
      case 'high':
        return 'bg-orange-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (!node) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={clsx('w-3 h-3 rounded-full', getPriorityColor(priority))} />
            <h2 className="text-xl font-semibold">
              {isEditing ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-transparent border-none outline-none"
                />
              ) : (
                title
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 rounded hover:bg-accent"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenInEditor}
              className="p-2 rounded hover:bg-accent"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-accent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Task Details */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Description */}
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Description</h3>
              {isEditing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 border border-input rounded-md bg-background resize-none"
                  rows={4}
                  placeholder="Enter task description..."
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {description || 'No description provided'}
                </p>
              )}
            </div>

            {/* Task Properties */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                {isEditing ? (
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full p-2 border border-input rounded-md bg-background"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={clsx('w-2 h-2 rounded-full', getPriorityColor(priority))} />
                    <span className="text-sm capitalize">{priority}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Assignee</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full p-2 border border-input rounded-md bg-background"
                    placeholder="Enter assignee..."
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {assignee || 'Unassigned'}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2 border border-input rounded-md bg-background"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {dueDate ? new Date(dueDate).toLocaleDateString() : 'No due date'}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                {isEditing ? (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  >
                                         {availableStatuses?.map(statusOption => {
                       // Find the column title for this status ID
                       const column = columns?.find(col => col.id === statusOption)
                       const displayName = column ? column.title : statusOption.charAt(0).toUpperCase() + statusOption.slice(1).replace('-', ' ')
                       return (
                         <option key={statusOption} value={statusOption}>
                           {displayName}
                         </option>
                       )
                     }) || (
                      <>
                        <option value="todo">Todo</option>
                        <option value="in-progress">In Progress</option>
                        <option value="review">Review</option>
                        <option value="done">Done</option>
                      </>
                    )}
                  </select>
                ) : (
                  <span className="text-sm text-muted-foreground capitalize">
                    {(() => {
                      const currentStatus = node.taskStatus || 'todo'
                      const column = columns?.find(col => col.id === currentStatus)
                      return column ? column.title : currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).replace('-', ' ')
                    })()}
                  </span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded flex items-center gap-1"
                  >
                    {tag}
                    {isEditing && (
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {isEditing && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    className="flex-1 p-2 border border-input rounded-md bg-background text-sm"
                    placeholder="Add tag..."
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Files */}
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Paperclip className="w-4 h-4" />
                Attachments ({files.length})
              </h3>
              {files.length > 0 && (
                <div className="space-y-2 mb-3">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{file.originalName}</div>
                          <div className="text-xs text-muted-foreground">
                            {FileStorage.formatFileSize(file.size)} • {file.uploadedAt.toLocaleDateString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {file.path ? `ID: ${file.id} • Location: ${file.path}` : '⚠️ File cannot be downloaded (old format)'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownloadFile(file)}
                          className="p-1 rounded hover:bg-accent"
                          title={file.path ? "Download file" : "File cannot be downloaded (old format)"}
                          disabled={!file.path}
                        >
                          <Download className={clsx("w-4 h-4", !file.path && "text-muted-foreground opacity-50")} />
                        </button>
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveFile(file)}
                            className="p-1 rounded hover:bg-accent"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isEditing && (
                <div>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="file-upload"
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2 border border-dashed border-input rounded-md cursor-pointer hover:bg-accent",
                      isUploading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm">
                      {isUploading ? 'Uploading...' : 'Upload files'}
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Soft Links */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-1">
                  <Link className="w-4 h-4" />
                  Related Content
                </h3>
                {isEditing && (
                  <button
                    onClick={() => setIsCreateLinkModalOpen(true)}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Create Link
                  </button>
                )}
              </div>
                             {(node.metadata.links || []).length > 0 ? (
                 <div className="space-y-2">
                   {(node.metadata.links || []).map((linkId: string, index: number) => {
                     // Find the linked node by ID
                     const linkedNode = Array.from(useNodeStore.getState().nodes.values())
                       .find(n => n.metadata.id === linkId)
                     
                     return (
                       <div
                         key={index}
                         className="p-2 bg-muted rounded-md text-sm cursor-pointer hover:bg-accent flex items-center justify-between"
                         title={linkedNode?.path || linkId}
                       >
                         <button
                           onClick={() => {
                             if (linkedNode) {
                               console.log('Navigating to task:', linkedNode.path)
                               console.log('Current URL before navigation:', window.location.href)
                               onClose()
                               // Navigate to the related task - use the correct path
                               const newPath = `/threads/${encodeURIComponent(linkedNode.path)}`
                               console.log('Navigating to:', newPath)
                               navigate(newPath)
                             }
                           }}
                           className="flex-1 text-left"
                         >
                           {linkedNode?.metadata.title || linkedNode?.name || linkId}
                         </button>
                         {isEditing && (
                           <button
                             onClick={async () => {
                               if (linkedNode) {
                                 console.log('Removing link between:', node.path, 'and', linkedNode.path)
                                 try {
                                   await useNodeStore.getState().removeSoftLink(node.path, linkedNode.path)
                                   // Update local node metadata to remove the link so subsequent saves stay consistent
                                   const updatedLinks = (node.metadata.links || []).filter((id: string) => id !== linkedNode.metadata.id)
                                   const updatedNode = {
                                     ...node,
                                     metadata: {
                                       ...node.metadata,
                                       links: updatedLinks
                                     }
                                   }
                                   onUpdate(updatedNode)
                                   toast.success('Link removed')
                                 } catch (error) {
                                   console.error('Failed to remove link:', error)
                                   toast.error('Failed to remove link')
                                 }
                               }
                             }}
                             className="p-1 text-muted-foreground hover:text-destructive"
                             title="Remove link"
                           >
                             <X className="w-3 h-3" />
                           </button>
                         )}
                       </div>
                     )
                   })}
                 </div>
               ) : (
                 <p className="text-sm text-muted-foreground">
                   No related content. {isEditing && "Click 'Create Link' to add connections to other nodes."}
                 </p>
               )}
            </div>

            {/* Save Button */}
            {isEditing && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-input rounded-md hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Right Panel - Comments */}
          <div className="w-80 border-l border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-medium flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Comments ({comments.length})
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {comment.timestamp.toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm bg-muted p-3 rounded-md">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 p-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Add a comment..."
                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <button
                  onClick={handleAddComment}
                  className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Create Link Modal */}
      {isCreateLinkModalOpen && (
        <CreateLinkModal
          currentNode={node}
          onClose={() => setIsCreateLinkModalOpen(false)}
          onLinkCreated={(updatedNode?: VerbweaverNode) => {
            setIsCreateLinkModalOpen(false)
            if (updatedNode) {
              onUpdate(updatedNode)
            } else if (node) {
              onUpdate({ ...node })
            }
          }}
        />
      )}
    </div>
  )
}

// Simple CreateLinkModal component
interface CreateLinkModalProps {
  currentNode: VerbweaverNode | null
  onClose: () => void
  onLinkCreated: (updatedNode?: VerbweaverNode) => void
}

function CreateLinkModal({ currentNode, onClose, onLinkCreated }: CreateLinkModalProps) {
  const { nodes, createSoftLink } = useNodeStore()
  const [selectedNodePath, setSelectedNodePath] = useState('')
  
     const availableNodes = Array.from(nodes.values()).filter(node => 
     node.path !== currentNode?.path && node.isMarkdown
   )
   
   console.log('Available nodes for linking:', availableNodes.length, availableNodes.map(n => ({ path: n.path, title: n.metadata.title || n.name })))
  
  const handleCreateLink = async () => {
    if (!currentNode || !selectedNodePath) return
    
    try {
      await createSoftLink(currentNode.path, selectedNodePath)
      // Update current node's metadata locally so subsequent Save keeps the link
      const selectedNode = nodes.get(selectedNodePath)
      if (selectedNode) {
        const updatedLinks = [...(currentNode.metadata.links || []), selectedNode.metadata.id]
        const updatedNode = {
          ...currentNode,
          metadata: {
            ...currentNode.metadata,
            links: updatedLinks
          }
        }
        onLinkCreated(updatedNode)
      } else {
        onLinkCreated()
      }
    } catch (error) {
      console.error('Failed to create link:', error)
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-96 p-6">
        <h3 className="text-lg font-semibold mb-4">Create Link</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Link this task to another task
        </p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Task</label>
          <select
            value={selectedNodePath}
            onChange={(e) => setSelectedNodePath(e.target.value)}
            className="w-full p-2 border border-input rounded-md bg-background"
          >
            <option value="">Choose a task...</option>
            {availableNodes.map((node) => (
              <option key={node.path} value={node.path}>
                {node.metadata.title || node.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-input rounded-md hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateLink}
            disabled={!selectedNodePath}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            Create Link
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskDetailModal 