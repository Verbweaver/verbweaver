import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { FolderOpen, Plus, BarChart3, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NewProjectDialog from '../components/NewProjectDialog';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export default function Dashboard() {
  const { projects, currentProject, loadProjects, setCurrentProjectPath } = useProjectStore();
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Load projects and recent projects
    loadProjects();
    
    if (isElectron && window.electronAPI) {
      loadRecentProjects();
    }
  }, [loadProjects]);

  const loadRecentProjects = async () => {
    if (!isElectron || !window.electronAPI) return;
    
    try {
      const recent = await window.electronAPI.getRecentProjects?.();
      setRecentProjects(recent || []);
    } catch (error) {
      console.error('Error loading recent projects:', error);
    }
  };

  const handleOpenProject = async (projectPath?: string) => {
    if (!isElectron || !window.electronAPI) return;
    
    try {
      if (projectPath) {
        // Open specific project from recent projects
        await window.electronAPI.openProject?.(projectPath);
        setCurrentProjectPath(projectPath);
        navigate('/dashboard');
      } else {
        // Open project dialog
        const result = await window.electronAPI.openDirectory?.();
        if (result && !result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          await window.electronAPI.openProject?.(selectedPath);
          setCurrentProjectPath(selectedPath);
          navigate('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error opening project:', error);
      alert('Failed to open project: ' + error);
    }
  };

  const handleNewProject = () => {
    setShowNewProjectDialog(true);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        {currentProject ? (
          <p className="text-muted-foreground">
            Current project: <span className="font-medium">{currentProject.name}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            No project selected. Create or open a project to get started.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Recent Projects</h3>
          </div>
          {recentProjects.length > 0 ? (
            <div className="space-y-2">
              {recentProjects.slice(0, 5).map((projectPath, index) => (
                <button
                  key={index}
                  onClick={() => handleOpenProject(projectPath)}
                  className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    <span className="text-sm truncate">
                      {projectPath.split(/[/\\]/).pop() || projectPath}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {projectPath}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No recent projects. Create or open a project to get started.
            </p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Quick Actions</h3>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleNewProject}
              className="w-full p-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Create New Project
            </button>
            <button
              onClick={() => handleOpenProject()}
              className="w-full p-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              Open Existing Project
            </button>
          </div>
        </div>

        {/* Project Statistics */}
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Project Statistics</h3>
          </div>
          {currentProject ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Projects:</span>
                <span className="text-sm font-medium">{projects.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Current Project:</span>
                <span className="text-sm font-medium">{currentProject.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                <span className="text-sm font-medium text-green-600">Active</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Open a project to view statistics.
            </p>
          )}
        </div>
      </div>

      {/* Project Status Message */}
      {!currentProject && (
        <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            No Project Selected
          </h4>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            To use Verbweaver's features, you need to create a new project or open an existing one. 
            Use the File menu or the Quick Actions above to get started.
          </p>
        </div>
      )}
      
      {/* New Project Dialog */}
      <NewProjectDialog 
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
      />
    </div>
  );
} 