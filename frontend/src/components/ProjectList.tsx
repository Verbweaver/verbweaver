import { useState, useEffect } from 'react'
import { FolderOpen, Trash2, Plus, Search, Calendar, GitBranch } from 'lucide-react'
import { projectsApi, Project } from '../api/projects'
import { useProjectStore } from '../store/projectStore'
import NewProjectDialog from './NewProjectDialog'

const isElectron = window.electronAPI !== undefined

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const { selectProject } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await projectsApi.getProjects()
      setProjects(data)
    } catch (err) {
      console.error('Error loading projects:', err)
      setError('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenProject = async (project: Project) => {
    try {
      selectProject(project.id)
      // Navigate to the project workspace
      // This will be handled by the router when we set up routing
    } catch (err) {
      console.error('Error opening project:', err)
      setError('Failed to open project')
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      setDeletingProjectId(projectId)
      await projectsApi.deleteProject(projectId)
      await loadProjects()
    } catch (err) {
      console.error('Error deleting project:', err)
      setError('Failed to delete project')
    } finally {
      setDeletingProjectId(null)
    }
  }

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">My Projects</h1>
            <button
              onClick={() => setShowNewProjectDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
              {error}
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects found</h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery ? 'Try adjusting your search query' : 'Create your first project to get started'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewProjectDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer group"
                  onClick={() => handleOpenProject(project)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-medium group-hover:text-primary">
                      {project.name}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteProject(project.id)
                      }}
                      disabled={deletingProjectId === project.id}
                      className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>

                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(project.created_at)}
                    </div>
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      {project.git_config.branch || 'main'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewProjectDialog
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
      />
    </>
  )
} 