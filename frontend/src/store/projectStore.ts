import { create } from 'zustand'
import { ProjectConfig } from '@verbweaver/shared'
import { projectApi } from '../api/projectApi'
import { projectsApi, GitConfig, ProjectCreate, Project } from '../api/projects'
import toast from 'react-hot-toast'
import { useAuthStore } from '../services/auth'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

interface ProjectState {
  projects: ProjectConfig[]
  currentProject: ProjectConfig | null
  currentProjectPath: string | null  // For Electron projects
  isLoading: boolean
  error: string | null
  hasLoadedOnce: boolean // Add flag to track if projects have been loaded at least once
  
  loadProjects: () => Promise<void>
  selectProject: (projectId: string) => void
  setCurrentProjectPath: (path: string, name?: string) => void  // For Electron
  createProject: (project: Omit<ProjectConfig, 'id' | 'created' | 'modified'>) => Promise<void>
  updateProject: (projectId: string, updates: Partial<ProjectConfig>) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentProjectPath: null,
  isLoading: false,
  error: null,
  hasLoadedOnce: false,

  loadProjects: async () => {
    // For web: check auth status from useAuthStore
    const { isAuthenticated, isHydrated } = useAuthStore.getState()

    // Prevent multiple simultaneous calls
    const state = get()
    if (state.isLoading) {
      console.log('[ProjectStore] Already loading projects, skipping duplicate call.');
      return;
    }

    if (!isHydrated) {
      console.log('[ProjectStore] Auth not hydrated yet. Aborting loadProjects.');
      return; 
    }

    if (!isAuthenticated) {
      console.log('[ProjectStore] User not authenticated. Aborting loadProjects.');
      return; 
    }

    console.log('[ProjectStore] Auth hydrated and user authenticated. Proceeding to load projects.');
    set({ isLoading: true, error: null })
    try {
      const projects = await projectApi.getProjects()
      set({ projects, isLoading: false, hasLoadedOnce: true })
      const currentState = get()
      
      // In desktop mode, check if we have a stored project path
      if (isElectron) {
        const storedPath = localStorage.getItem('verbweaver_active_project_path')
        if (storedPath) {
          // Find the project with this path
          const projectWithPath = projects.find(p => 
            p.gitRepository?.type === 'local' && 
            p.gitRepository?.path === storedPath
          )
          if (projectWithPath) {
            set({ 
              currentProject: projectWithPath,
              currentProjectPath: storedPath
            })
            return
          }
        }
      }
      
      if (!currentState.currentProject && projects.length > 0) {
        currentState.selectProject(projects[0].id)
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[ProjectStore] Failed to load projects:', errorMessage);
      set({ error: errorMessage, isLoading: false })
      
      // Only show toast for non-401 errors to prevent spam
      if (!(error as any).response || (error as any).response.status !== 401) {
        toast.error('Failed to load projects: ' + errorMessage)
      } else {
        console.log('[ProjectStore] 401 error - user not authenticated, not showing toast');
      }
    }
  },

  selectProject: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId)
    if (project) {
      set({ currentProject: project })
      localStorage.setItem('verbweaver_active_project', projectId)
    }
  },

  setCurrentProjectPath: async (path: string, name?: string) => {
    // For Electron projects, register with backend to get proper UUID
    const projectName = name || path.split(/[/\\]/).pop() || 'Unknown Project'
    
    try {
      // First, check if this project already exists in the backend by querying all projects
      let existingProject = null
      
      try {
        // Get all projects from backend to check for existing one
        const backendProjects = await projectsApi.getProjects()
        existingProject = backendProjects.find(p => 
          p.git_config?.type === 'local' && 
          p.git_config?.path === path
        )
      } catch (error) {
        console.warn('Failed to check existing projects from backend:', error)
        // Fallback to local check
        const { projects } = get()
        existingProject = projects.find(p => 
          p.gitRepository?.type === 'local' && 
          p.gitRepository?.path === path
        )
      }
      
      if (!existingProject) {
        // Create the project in the backend
        const gitConfig: GitConfig = {
          type: 'local',
          path: path,
          branch: 'main',
          autoPush: false
        }
        
        const projectData: ProjectCreate = {
          name: projectName,
          description: `Local project at ${path}`,
          git_config: gitConfig
        }
        
        // Create project via API to get proper UUID
        const createdProject = await projectsApi.createProject(projectData)
        
        // Convert API Project to ProjectConfig format
        const projectConfig: ProjectConfig = {
          id: createdProject.id,
          name: createdProject.name,
          description: createdProject.description || `Local project at ${path}`,
          created: createdProject.created_at,
          modified: createdProject.updated_at || createdProject.created_at,
          settings: createdProject.settings || {},
          gitRepository: {
            url: createdProject.git_config.url || '',
            branch: createdProject.git_config.branch || 'main',
            type: createdProject.git_config.type || 'local'
          }
        }
        
        // Add to local projects list
        set(state => ({
          projects: [...state.projects, projectConfig],
          currentProject: projectConfig,
          currentProjectPath: path
        }))
        
        existingProject = projectConfig
      } else {
        // Convert backend Project to ProjectConfig format
        const projectConfig: ProjectConfig = {
          id: existingProject.id,
          name: existingProject.name,
          description: existingProject.description || `Local project at ${path}`,
          created: 'created_at' in existingProject ? existingProject.created_at : existingProject.created,
          modified: 'updated_at' in existingProject ? (existingProject.updated_at || existingProject.created_at) : ('modified' in existingProject ? existingProject.modified : new Date().toISOString()),
          settings: existingProject.settings || {},
          gitRepository: {
            url: 'git_config' in existingProject ? (existingProject.git_config.url || '') : (existingProject.gitRepository?.url || ''),
            branch: 'git_config' in existingProject ? (existingProject.git_config.branch || 'main') : (existingProject.gitRepository?.branch || 'main'),
            type: 'git_config' in existingProject ? (existingProject.git_config.type || 'local') : (existingProject.gitRepository?.type || 'local')
          }
        }
        
        // Update local projects list to include this project if not already present
        set(state => {
          const existingInLocal = state.projects.find(p => p.id === projectConfig.id)
          if (!existingInLocal) {
            return {
              projects: [...state.projects, projectConfig],
              currentProject: projectConfig,
              currentProjectPath: path
            }
          } else {
            return {
              currentProject: projectConfig,
              currentProjectPath: path
            }
          }
        })
        
        existingProject = projectConfig
      }
      
      localStorage.setItem('verbweaver_active_project', existingProject.id)
      localStorage.setItem('verbweaver_active_project_path', path)
      toast.success(`Opened project: ${projectName}`)
    } catch (error) {
      console.error('Failed to register project with backend:', error)
      // Fallback to the old behavior if backend registration fails
      const mockProject: ProjectConfig = {
        id: path, // Use path as ID for Electron projects
        name: projectName,
        description: `Local project at ${path}`,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        settings: {},
        gitRepository: {
          url: '',
          branch: 'main',
          type: 'local'
        }
      }
      
      set({ 
        currentProject: mockProject,
        currentProjectPath: path 
      })
      
      localStorage.setItem('verbweaver_active_project_path', path)
      toast.error(`Opened project locally: ${projectName} (offline mode)`)
    }
  },

  createProject: async (projectData: Omit<ProjectConfig, 'id' | 'created' | 'modified'>) => {
    set({ isLoading: true, error: null })
    try {
      if (isElectron && window.electronAPI) {
        // For Electron, project creation involves native dialogs and main process operations
        const { name: preferredName } = projectData;

        // 1. Ask user for a base directory to create the project in.
        const dirResult = await window.electronAPI.openDirectory(); // Uses the exposed API

        if (dirResult.canceled || !dirResult.filePaths || dirResult.filePaths.length === 0) {
          set({ isLoading: false, error: 'Project location selection cancelled.' });
          toast.error('Project creation cancelled: No location selected.');
          return;
        }

        const baseDirectoryPath = dirResult.filePaths[0];
        
        // Determine the actual project name (e.g., from input or folder name)
        // For now, we assume projectData.name is the desired project name.
        // If projectData.name is not provided, this logic would need to be more robust
        // (e.g. prompt for name, or use a default like 'NewVerbweaverProject')
        const projectName = preferredName || baseDirectoryPath.split(/[/\\]/).pop() || 'New Verbweaver Project';
        
        // Construct the full path for the new project (e.g., /chosen/path/MyProjectName)
        // Ensure project name is filesystem-friendly.
        const projectFolderName = projectName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.-]/g, '');
        const finalProjectPath = `${baseDirectoryPath}/${projectFolderName}`;

        // 2. Call the main process to create the project structure and get the confirmed path.
        // The main process handler for 'project:create' now returns the actual path.
        const newProjectPath = await window.electronAPI.createProject(projectName, finalProjectPath);

        if (newProjectPath && typeof newProjectPath === 'string') {
          // If creation was successful and a valid path string was returned
          get().setCurrentProjectPath(newProjectPath, projectName);
          set({ isLoading: false });
          // toast.success is handled by setCurrentProjectPath
        } else {
          // This case should ideally be caught by an error thrown from createProject if it fails
          console.error('[ProjectStore] Project creation in main process did not return a valid path.', newProjectPath);
          throw new Error('Project creation failed or path was not returned from main process.');
        }
        return; // Electron project creation handled
      }
      
      // Web version: uses API
      const newProject = await projectApi.createProject(projectData)
      set(state => ({
        projects: [...state.projects, newProject],
        currentProject: newProject,
        isLoading: false
      }))
      localStorage.setItem('verbweaver_active_project', newProject.id);
      toast.success('Project created successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ProjectStore] Failed to create project:', errorMessage, error);
      set({ error: errorMessage, isLoading: false })
      toast.error(`Failed to create project: ${errorMessage}`)
    }
  },

  updateProject: async (projectId, updates) => {
    set({ isLoading: true, error: null })
    try {
      const updatedProject = await projectApi.updateProject(projectId, updates)
      set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        currentProject: state.currentProject?.id === projectId ? updatedProject : state.currentProject,
        isLoading: false
      }))
      toast.success('Project updated successfully')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to update project')
    }
  },

  deleteProject: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      await projectApi.deleteProject(projectId)
      set(state => ({
        projects: state.projects.filter(p => p.id !== projectId),
        currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        isLoading: false
      }))
      toast.success('Project deleted successfully')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to delete project')
    }
  }
}))

// Listen for project opened events from main process in Electron
if (isElectron && window.electronAPI && window.electronAPI.onProjectOpened) {
  const projectStore = useProjectStore.getState();
  const unsubscribe = window.electronAPI.onProjectOpened((_event, path) => {
    console.log('[ProjectStore] Received project:opened event from main with path:', path);
    // No need to pass name, setCurrentProjectPath will extract it from the path
    projectStore.setCurrentProjectPath(path);
  });
  
  // It's good practice to handle unsubscription, though for a global store like Zustand,
  // it might effectively live for the app's lifetime. 
  // If this store were part of a component, unsubscription on unmount would be critical.
  // For now, we'll log that it's set up. If issues arise, proper cleanup might be needed.
  console.log('[ProjectStore] Subscribed to project:opened events from main process.');

  // To make sure this is only called once, you might use a flag in the store itself
  // or rely on the module import mechanism ensuring this top-level code runs once.
} 