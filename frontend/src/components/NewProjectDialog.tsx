import { useState } from 'react'
import { X } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { projectsApi } from '../api/projects'

interface NewProjectDialogProps {
  isOpen: boolean
  onClose: () => void
}

const isElectron = window.electronAPI !== undefined

export default function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const { loadProjects, setCurrentProjectPath } = useProjectStore()

  if (!isOpen) return null

  const handleSelectPath = async () => {
    if (!isElectron || !window.electronAPI) return
    
    try {
      const result = await window.electronAPI.openDirectory()
      if (!result.canceled && result.filePaths.length > 0) {
        setProjectPath(result.filePaths[0])
      }
    } catch (error) {
      console.error('Error selecting path:', error)
    }
  }

  const handleCreate = async () => {
    if (!projectName) {
      setError('Project name is required')
      return
    }
    
    // For desktop version, path is also required
    if (isElectron && !projectPath) {
      setError('Project location is required')
      return
    }
    
    setIsCreating(true)
    setError('')
    
    try {
      if (isElectron && window.electronAPI) {
        // Desktop version: Create project with specified path
        await window.electronAPI.createProject(projectName, projectPath)
        
        // Set the current project path in the store
        setCurrentProjectPath(projectPath, projectName)
      } else {
        // Web version: Create project on server
        const gitConfig = {
          type: 'local' as const,
          // For web version, we don't specify a path - server will use default
          path: null,
          branch: 'main',
          autoPush: false
        }
        
        await projectsApi.createProject({
          name: projectName,
          description: projectDescription || undefined,
          git_config: gitConfig
        })
      }
      
      // Reload projects
      await loadProjects()
      
      // Close dialog and reset form
      onClose()
      setProjectName('')
      setProjectPath('')
      setProjectDescription('')
      setError('')
    } catch (error) {
      console.error('Error creating project:', error)
      setError(error instanceof Error ? error.message : 'Failed to create project')
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
              Description (optional)
            </label>
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background min-h-[80px]"
              placeholder="A brief description of your project..."
            />
          </div>

          {/* Only show path selector for desktop version */}
          {isElectron && (
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
                <button
                  onClick={handleSelectPath}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Browse
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                If the folder doesn't exist, it will be created automatically.
              </p>
            </div>
          )}

          {/* For web version, show where projects will be stored */}
          {!isElectron && (
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
              Your project will be stored securely on the Verbweaver server and can be accessed from any device.
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
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
            disabled={!projectName || (isElectron && !projectPath) || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
} 