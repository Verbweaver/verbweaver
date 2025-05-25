import { useState } from 'react'
import { X } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'

interface NewProjectDialogProps {
  isOpen: boolean
  onClose: () => void
}

const isElectron = window.electronAPI !== undefined

export default function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { loadProjects } = useProjectStore()

  if (!isOpen) return null

  const handleSelectPath = async () => {
    if (!isElectron || !window.electronAPI) return
    
    try {
      const result = await window.electronAPI.openFile()
      if (!result.canceled && result.filePaths.length > 0) {
        setProjectPath(result.filePaths[0])
      }
    } catch (error) {
      console.error('Error selecting path:', error)
    }
  }

  const handleCreate = async () => {
    if (!projectName || !projectPath) return
    
    setIsCreating(true)
    try {
      if (isElectron && window.electronAPI) {
        await window.electronAPI.createProject(projectName, projectPath)
      }
      
      // Reload projects
      await loadProjects()
      
      // Close dialog
      onClose()
      setProjectName('')
      setProjectPath('')
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Failed to create project: ' + error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg p-6 w-[500px] max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New Project</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
              placeholder="My Verbweaver Project"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Project Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
                placeholder="C:\Projects\my-project"
              />
              {isElectron && (
                <button
                  onClick={handleSelectPath}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Browse
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-md hover:bg-muted"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            disabled={!projectName || !projectPath || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
} 