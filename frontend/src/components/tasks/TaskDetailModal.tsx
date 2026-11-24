import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Send, Paperclip, Link, User, Calendar, Tag, MessageSquare, Edit3, Download, Trash2, FileText, Eye, ChevronDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNodeStore } from '../../store/nodeStore'
import { useTabStore } from '../../store/tabStore'
import { TaskState, TaskPriority } from '@verbweaver/shared'
import { FileStorage, StoredFile } from '../../utils/fileStorage'
import { getLinkedNodes } from '../../utils/nodeLinks'
import { getNodeFiles, uploadFilesForNode } from '../../utils/nodeAttachments'
import clsx from 'clsx'
import SharedCreateLinkModal from '../common/CreateLinkModal'
import { KanbanColumn } from './ColumnManager'
import toast from 'react-hot-toast'
import { editorApi } from '../../api/editorApi'
import { useProjectStore } from '../../store/projectStore'

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
  // Persisted comments come back from front-matter as strings; new ones are stored as ISO strings
  timestamp: Date | string
}

interface TaskDetailModalProps {
  node: VerbweaverNode | null
  onClose: () => void
  onUpdate: (node: VerbweaverNode) => void
  availableStatuses?: string[]
  columns?: KanbanColumn[]
  onDelete?: () => void
}

function TaskDetailModal({ node, onClose, onUpdate, availableStatuses, columns, onDelete }: TaskDetailModalProps) {
  const { updateNode, getNode, loadNodes } = useNodeStore()
  const nodesMap = useNodeStore((s) => s.nodes)
  const { addEditorTab } = useTabStore()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [status, setStatus] = useState('todo')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [levelOfEffort, setLevelOfEffort] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [newComment, setNewComment] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<StoredFile[]>([])
  // Staged soft links (target node IDs); applied to disk only on Save
  const [draftLinkIds, setDraftLinkIds] = useState<string[]>([])
  // Files uploaded during the current edit session; deleted from disk if the edit is cancelled
  const sessionUploadsRef = useRef<StoredFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isCreateLinkModalOpen, setIsCreateLinkModalOpen] = useState(false)
  const dueDateInputRef = useRef<HTMLInputElement | null>(null)
  const startDateInputRef = useRef<HTMLInputElement | null>(null)
  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewError, setPreviewError] = useState<string>('')
  const { currentProjectPath } = useProjectStore()

  // Resolve the staged links (IDs) to nodes for display
  const linkedNodes = useMemo(
    () => (node ? getLinkedNodes<VerbweaverNode>({ ...node, softLinks: draftLinkIds }, nodesMap) : []),
    [node?.path, draftLinkIds, nodesMap]
  )

  /** Store copy of a node, cast to this component's local node shape. */
  const storeNode = (path: string) => getNode(path) as unknown as VerbweaverNode | undefined

  /** Latest copy of this node: the store's if present, else the (possibly stale) prop. */
  const currentNode = (): VerbweaverNode | null => (node ? storeNode(node.path) || node : null)

  /** Reset all editable draft state to the given node's saved values. Comments are not draft. */
  const resetDraft = (n: VerbweaverNode) => {
    const task = n.metadata.task || {}
    setTitle(n.metadata.title || n.name)
    setDescription(n.metadata.description || '')
    setPriority(task.priority || n.metadata.priority || 'medium')
    setStatus(n.taskStatus || task.status || 'todo')
    setAssignee(task.assignee || n.metadata.assignee || '')
    // Prefer task.dueDate; migrate legacy metadata.dueDate
    setDueDate(task.dueDate || n.metadata.dueDate || '')
    // Support new fields with legacy fallback
    setStartDate(task.startDate || n.metadata.startDate || '')
    // Older tasks may hold a number (or NaN) here; keep it as text so Save can't crash
    const loe: unknown = task.levelOfEffort ?? n.metadata.levelOfEffort
    setLevelOfEffort(loe == null || (typeof loe === 'number' && Number.isNaN(loe)) ? '' : String(loe))
    setTags(n.metadata.tags || [])
    setNewTag('')
    setFiles(getNodeFiles(n))
    setDraftLinkIds(Array.isArray(n.softLinks) ? n.softLinks.map(String) : [])
    sessionUploadsRef.current = []
  }

  // Initialize when a different task is shown. Keyed on path (not node identity) so parent
  // re-renders with a new object don't clobber an edit in progress.
  useEffect(() => {
    const n = currentNode()
    if (n) {
      resetDraft(n)
      setComments(n.metadata.task?.comments || [])
      setIsEditing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only when the task changes
  }, [node?.path])

  /** Delete files uploaded during this edit session (they were never saved to the task). */
  const discardSessionUploads = async () => {
    const uploads = sessionUploadsRef.current
    sessionUploadsRef.current = []
    for (const f of uploads) {
      try { await FileStorage.deleteFile(f) } catch (e) { console.error('Failed to discard upload:', e) }
    }
  }

  const handleCancel = async () => {
    await discardSessionUploads()
    const n = currentNode()
    if (n) resetDraft(n)
    setIsEditing(false)
  }

  const handleClose = async () => {
    if (isEditing) await handleCancel()
    onClose()
  }

  // Fetch preview when opened
  useEffect(() => {
    const fetchPreview = async () => {
      if (!previewOpen || !node) return
      if (!node.isMarkdown) {
        setPreviewHtml('')
        setPreviewError('Preview available for Markdown nodes only.')
        return
      }
      try {
        setPreviewLoading(true)
        setPreviewError('')
        const html = await editorApi.previewMarkdown(node.content || '', currentProjectPath || undefined, node.path)
        setPreviewHtml(html)
      } catch (e) {
        setPreviewError('Failed to load preview')
      } finally {
        setPreviewLoading(false)
      }
    }
    fetchPreview()
  }, [previewOpen, node, currentProjectPath])

  const handleSave = async () => {
    const saved = currentNode()
    if (!node || !saved) return

    const updatedMetadata: any = {
      ...saved.metadata,
      title,
      description,
      priority,
      assignee,
      // Remove legacy top-level dueDate to enforce single source under task
      // dueDate,
      tags,
      task: {
        ...saved.metadata.task,
        status,
        priority,
        assignee,
        dueDate: dueDate || undefined,
        startDate: startDate || undefined,
        levelOfEffort: levelOfEffort ? levelOfEffort.slice(0, 100) : undefined,
        // Comments are persisted as they are added; keep the stored list
        files
      }
    }

    // Clean legacy field if present
    if ('dueDate' in updatedMetadata) delete updatedMetadata.dueDate
    if ('startDate' in updatedMetadata) delete updatedMetadata.startDate
    if ('levelOfEffort' in updatedMetadata) delete updatedMetadata.levelOfEffort

    try {
      await updateNode(node.path, { metadata: updatedMetadata })

      // Apply staged link changes after the field write so it can't overwrite them
      const store = useNodeStore.getState()
      const pathForId = (id: string) => {
        for (const other of store.nodes.values()) {
          if (String(other.metadata?.id || '') === id) return other.path
        }
        return null
      }
      const savedLinkIds = Array.isArray(saved.softLinks) ? saved.softLinks.map(String) : []
      for (const id of savedLinkIds.filter((id) => !draftLinkIds.includes(id))) {
        const target = pathForId(id)
        if (target) await store.removeSoftLink(node.path, target)
      }
      for (const id of draftLinkIds.filter((id) => !savedLinkIds.includes(id))) {
        const target = pathForId(id)
        if (target) await store.createSoftLink(node.path, target)
      }
    } catch (error) {
      console.error('Failed to save task:', error)
      toast.error('Failed to save task')
      return
    }

    // Removed attachments are deleted from disk only once the save succeeds
    const keptIds = new Set(files.map((f) => f.id))
    for (const f of getNodeFiles(saved).filter((f) => !keptIds.has(f.id))) {
      try { await FileStorage.deleteFile(f) } catch (e) { console.error('Failed to delete removed file:', e) }
    }
    sessionUploadsRef.current = []

    try {
      await loadNodes()
    } catch {}

    const fresh = storeNode(node.path) || { ...saved, metadata: updatedMetadata, taskStatus: status as TaskState }
    onUpdate(fresh)
    resetDraft(fresh)
    setIsEditing(false)
  }

  // Comments are not part of the edit draft: each one is written to the task immediately
  const handleAddComment = async () => {
    if (!node || !newComment.trim()) return

    const comment: Comment = {
      id: Date.now().toString(),
      author: 'Current User', // TODO: Get from auth context
      content: newComment,
      timestamp: new Date().toISOString()
    }

    try {
      // Re-read the stored node so unsaved draft edits aren't written along with the comment
      const saved = currentNode()
      const task = saved?.metadata?.task || {}
      const nextComments = [...(Array.isArray(task.comments) ? task.comments : []), comment]
      await updateNode(node.path, { metadata: { task: { ...task, comments: nextComments } } })
      setComments(nextComments)
      setNewComment('')
      const fresh = storeNode(node.path)
      if (fresh) onUpdate(fresh)
    } catch (error) {
      console.error('Failed to add comment:', error)
      toast.error('Failed to add comment')
    }
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
      const newFiles = await uploadFilesForNode(uploadedFiles, node.path)
      sessionUploadsRef.current = [...sessionUploadsRef.current, ...newFiles]
      setFiles((prev) => [...prev, ...newFiles])
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
    setFiles((prev) => prev.filter((file) => file.id !== fileToRemove.id))
    // A file uploaded in this session was never saved to the task, so delete it right away.
    // Previously saved files are deleted from disk only when the edit is saved.
    if (sessionUploadsRef.current.some((f) => f.id === fileToRemove.id)) {
      sessionUploadsRef.current = sessionUploadsRef.current.filter((f) => f.id !== fileToRemove.id)
      try { await FileStorage.deleteFile(fileToRemove) } catch (error) { console.error('Failed to remove file:', error) }
    }
  }

  const handleOpenInEditor = () => {
    if (node) {
      const tabId = addEditorTab(node.path, node.name)
      // Set the new tab as active
      useTabStore.getState().setActiveTab(tabId)
      navigate(`/editor/${encodeURIComponent(node.path)}`) // Navigate to the editor path
      void handleClose() // Close the modal after opening the editor
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
              onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              className="p-2 rounded hover:bg-accent"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={handleOpenInEditor} className="p-2 rounded hover:bg-accent">
              <FileText className="w-4 h-4" />
            </button>
            {onDelete && (
              <button onClick={onDelete} className="p-2 rounded hover:bg-accent" title="Delete task">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleClose}
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
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
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
                <label className="block text-sm font-medium mb-1">Start Date</label>
                {isEditing ? (
                  <input
                    ref={startDateInputRef}
                    type="date"
                    value={startDate || ''}
                    onChange={(e) => setStartDate(e.target.value)}
                    onFocus={() => { try { (startDateInputRef.current as any)?.showPicker?.() } catch {} }}
                    onClick={() => { try { (startDateInputRef.current as any)?.showPicker?.() } catch {} }}
                    className="w-full p-2 border border-input rounded-md bg-background"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {(() => {
                      if (!startDate) return 'No start date'
                      const [y,m,d] = startDate.split('-').map(Number)
                      const dt = new Date(y, (m || 1)-1, d || 1)
                      return dt.toLocaleDateString()
                    })()}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Level of Effort</label>
                {isEditing ? (
                  <input
                    type="text"
                    maxLength={100}
                    value={levelOfEffort}
                    onChange={(e) => setLevelOfEffort(e.target.value.slice(0, 100))}
                    className="w-full p-2 border border-input rounded-md bg-background"
                    placeholder="e.g., 3 points, 1 day, medium"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {levelOfEffort || '—'}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                {isEditing ? (
                  <input
                    ref={dueDateInputRef}
                    type="date"
                    value={dueDate || ''}
                    onChange={(e) => setDueDate(e.target.value)}
                    onFocus={() => { try { (dueDateInputRef.current as any)?.showPicker?.() } catch {} }}
                    onClick={() => { try { (dueDateInputRef.current as any)?.showPicker?.() } catch {} }}
                    className="w-full p-2 border border-input rounded-md bg-background"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {(() => {
                      if (!dueDate) return 'No due date'
                      const [y,m,d] = dueDate.split('-').map(Number)
                      const dt = new Date(y, (m || 1)-1, d || 1)
                      return dt.toLocaleDateString()
                    })()}
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
                            {[FileStorage.formatFileSize(file.size), FileStorage.formatUploadDate(file.uploadedAt)].filter(Boolean).join(' • ')}
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
              {linkedNodes.length > 0 ? (
                <div className="space-y-2">
                  {linkedNodes.map((ln) => {
                    const handleCopy = async () => {
                      const idToCopy = ln.metadata?.id
                      if (!idToCopy) return
                      const core = String(idToCopy || '').replace(/^node-/, '')
                      const tag = `node-${core}`
                      try {
                        if ((navigator as any)?.clipboard?.writeText) {
                          await (navigator as any).clipboard.writeText(tag)
                        } else {
                          const ta = document.createElement('textarea')
                          ta.value = tag
                          ta.style.position = 'fixed'
                          ta.style.opacity = '0'
                          document.body.appendChild(ta)
                          ta.focus(); ta.select(); try { document.execCommand('copy') } catch {}
                          document.body.removeChild(ta)
                        }
                        toast.success('Copied node ID tag')
                      } catch {
                        toast.error('Copy failed')
                      }
                    }

                    return (
                      <div
                        key={ln.path}
                        className="p-2 bg-muted rounded-md text-sm hover:bg-accent flex items-center justify-between"
                        title={ln.path}
                      >
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <button
                            onClick={async () => {
                              await handleClose()
                              navigate(`/tasks/${encodeURIComponent(ln.path)}`)
                            }}
                            className="text-left truncate"
                          >
                            {ln.metadata?.title || ln.name}
                          </button>
                          {ln.metadata?.id && (
                            <button
                              onClick={handleCopy}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground whitespace-nowrap"
                              title={`Copy node ID tag (${String(ln.metadata.id).replace(/^node-/, '')})`}
                            >
                              {String(ln.metadata.id).replace(/^node-/, '')}
                            </button>
                          )}
                        </div>
                        {isEditing && (
                          <button
                            onClick={() => {
                              const id = String(ln.metadata?.id || '')
                              setDraftLinkIds((prev) => prev.filter((v) => v !== id))
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
                  onClick={handleCancel}
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
                      {new Date(comment.timestamp).toLocaleDateString()}
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
        {/* Node Content Preview (inside modal, below task data) */}
        <div className="border-t border-border">
          <div className="p-4">
            <button
              className={clsx('w-full flex items-center justify-between px-3 py-2 rounded hover:bg-accent', previewOpen && 'bg-accent')}
              onClick={() => setPreviewOpen(prev => !prev)}
            >
              <span className="text-sm font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Node Content Preview
              </span>
              {previewOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {previewOpen && (
              <div className="mt-2 border border-border rounded-md bg-muted/30 max-h-80 overflow-auto">
                {previewLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading preview…</div>
                ) : previewError ? (
                  <div className="p-4 text-sm text-destructive">{previewError}</div>
                ) : previewHtml ? (
                  <div className="p-4 prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">No content to preview</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Link Modal (shared) */}
      {isCreateLinkModalOpen && node && (
        <SharedCreateLinkModal
          currentNodePath={node.path}
          onClose={() => setIsCreateLinkModalOpen(false)}
          excludeIds={draftLinkIds}
          onSelectTarget={(targetPath) => {
            const id = String(nodesMap.get(targetPath)?.metadata?.id || '')
            if (id) setDraftLinkIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
          }}
        />
      )}
    </div>
  )
}

export default TaskDetailModal 