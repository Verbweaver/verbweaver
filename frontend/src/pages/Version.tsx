import { useState, useEffect } from 'react';
import { GitBranch, GitCommit, Plus, RefreshCw, Upload, Download, Eye, X } from 'lucide-react';
import { api } from '../services/auth';
import { useProjectStore } from '../store/projectStore';
import toast from 'react-hot-toast';
import Editor from '@monaco-editor/react';
import { useThemeStore } from '../store/themeStore';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

interface Commit {
  sha: string;
  message: string;
  author: string;
  email?: string;
  date: string;
}

interface Branch {
  name: string;
  is_current: boolean;
  is_remote?: boolean;
}

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export default function VersionControlView() {
  const { currentProject, currentProjectPath } = useProjectStore();
  const { theme } = useThemeStore();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  const [showDiff, setShowDiff] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isGitInitialized, setIsGitInitialized] = useState(true);

  useEffect(() => {
    if (currentProject || currentProjectPath) {
      loadGitStatus();
    }
  }, [currentProject, currentProjectPath]);

  const loadGitStatus = async () => {
    if (isElectron && currentProjectPath && window.electronAPI) {
      // For Electron, use actual Git commands
      setIsLoading(true);
      try {
        // Get status
        const status = await window.electronAPI.gitStatus(currentProjectPath);
        setChanges(status.changes || []);
        
        // Get branches
        const branchList = await window.electronAPI.gitGetBranches(currentProjectPath);
        setBranches(branchList);
        const current = branchList.find((b: Branch) => b.is_current);
        if (current) setCurrentBranch(current.name);
        
        // Get commits
        const commitList = await window.electronAPI.gitGetCommits(currentProjectPath, 50);
        setCommits(commitList);
        
        // If we got here, git is initialized
        setIsGitInitialized(true);
      } catch (error: any) {
        console.error('Failed to load git status:', error);
        // Check if it's because git is not initialized
        if (error.message?.includes('not a git repository')) {
          setIsGitInitialized(false);
        }
        // Reset state
        setChanges([]);
        setBranches([]);
        setCommits([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!isElectron && currentProject) {
      setIsLoading(true);
      try {
        // Load branches
        const branchesRes = await api.get('/git/branches');
        setBranches(branchesRes.data);
        const current = branchesRes.data.find((b: Branch) => b.is_current);
        if (current) setCurrentBranch(current.name);

        // Load commits
        const commitsRes = await api.get('/git/commits');
        setCommits(commitsRes.data);

        // Load changes
        const changesRes = await api.get('/git/status');
        setChanges(changesRes.data.changes || []);
      } catch (error) {
        console.error('Failed to load git status:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || selectedFiles.size === 0) return;

    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        await window.electronAPI.gitCommit(
          currentProjectPath, 
          commitMessage, 
          Array.from(selectedFiles)
        );
        setCommitMessage('');
        setSelectedFiles(new Set());
        await loadGitStatus();
        toast.success('Changes committed successfully');
      } else if (currentProject) {
        await api.post('/git/commit', {
          message: commitMessage,
          files: Array.from(selectedFiles)
        });
        setCommitMessage('');
        setSelectedFiles(new Set());
        await loadGitStatus();
        toast.success('Changes committed successfully');
      }
    } catch (error) {
      console.error('Failed to commit:', error);
      toast.error('Failed to commit changes');
    }
  };

  const handleFileToggle = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  };

  const handlePush = async () => {
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        await window.electronAPI.gitPush(currentProjectPath);
        toast.success('Successfully pushed to remote');
      } else if (currentProject) {
        await api.post('/git/push');
        toast.success('Successfully pushed to remote');
      }
    } catch (error) {
      console.error('Failed to push:', error);
      toast.error('Failed to push changes. Make sure you have a remote configured.');
    }
  };

  const handlePull = async () => {
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        await window.electronAPI.gitPull(currentProjectPath);
        await loadGitStatus();
        toast.success('Successfully pulled from remote');
      } else if (currentProject) {
        await api.post('/git/pull');
        await loadGitStatus();
        toast.success('Successfully pulled from remote');
      }
    } catch (error) {
      console.error('Failed to pull:', error);
      toast.error('Failed to pull changes. Make sure you have a remote configured.');
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        await window.electronAPI.gitCreateBranch(currentProjectPath, newBranchName);
        setNewBranchName('');
        setShowNewBranchDialog(false);
        await loadGitStatus();
        toast.success(`Created and switched to branch "${newBranchName}"`);
      } else if (currentProject) {
        await api.post('/git/branch', { name: newBranchName });
        setNewBranchName('');
        setShowNewBranchDialog(false);
        await loadGitStatus();
        toast.success(`Created and switched to branch "${newBranchName}"`);
      }
    } catch (error) {
      console.error('Failed to create branch:', error);
      toast.error('Failed to create branch');
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    if (branchName === currentBranch) return;

    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        await window.electronAPI.gitSwitchBranch(currentProjectPath, branchName);
        await loadGitStatus();
        toast.success(`Switched to branch "${branchName}"`);
      } else if (currentProject) {
        await api.post('/git/checkout', { branch: branchName });
        await loadGitStatus();
        toast.success(`Switched to branch "${branchName}"`);
      }
    } catch (error) {
      console.error('Failed to switch branch:', error);
      toast.error('Failed to switch branch. Make sure you have no uncommitted changes.');
    }
  };

  const handleViewDiff = async (filePath?: string) => {
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        const diff = await window.electronAPI.gitGetDiff(currentProjectPath, filePath);
        setDiffContent(diff || 'No changes');
        setSelectedFile(filePath || null);
        setShowDiff(true);
      }
    } catch (error) {
      console.error('Failed to get diff:', error);
      toast.error('Failed to get diff');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const handleInitGit = async () => {
    if (!currentProjectPath || !window.electronAPI) return;
    
    try {
      setIsLoading(true);
      await window.electronAPI.gitInit(currentProjectPath);
      
      // Create initial commit
      await window.electronAPI.gitCommit(
        currentProjectPath,
        'Initial commit',
        ['.']
      );
      
      setIsGitInitialized(true);
      await loadGitStatus();
      toast.success('Git repository initialized');
    } catch (error) {
      console.error('Failed to initialize git:', error);
      toast.error('Failed to initialize Git repository');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentProject && !currentProjectPath) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to view version control
          </p>
        </div>
      </div>
    );
  }

  // Show Git initialization prompt if not initialized
  if (isElectron && !isGitInitialized) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <GitBranch className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Git Not Initialized</h2>
          <p className="text-muted-foreground mb-6">
            This project doesn't have a Git repository yet. Initialize Git to start tracking changes and using version control features.
          </p>
          <button
            onClick={handleInitGit}
            disabled={isLoading}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Initializing...' : 'Initialize Git Repository'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left Panel - Changes */}
      <div className="w-80 border-r bg-background p-4 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Changes</h3>
          <button
            onClick={loadGitStatus}
            disabled={isLoading}
            className="p-2 hover:bg-accent rounded-md transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {changes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No changes to commit</p>
        ) : (
          <div className="space-y-2">
            {changes.map((change) => (
              <div
                key={change.path}
                className="flex items-center gap-2 p-2 hover:bg-accent rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(change.path)}
                  onChange={() => handleFileToggle(change.path)}
                  className="rounded"
                />
                <span className="flex-1 text-sm truncate">{change.path}</span>
                <span className={`text-xs px-1 rounded ${
                  change.status === 'added' ? 'bg-green-500/20 text-green-500' :
                  change.status === 'deleted' ? 'bg-red-500/20 text-red-500' :
                  'bg-yellow-500/20 text-yellow-500'
                }`}>
                  {change.status}
                </span>
                {isElectron && (
                  <button
                    onClick={() => handleViewDiff(change.path)}
                    className="p-1 hover:bg-muted rounded"
                    title="View diff"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message..."
            className="w-full p-2 border rounded-md bg-background resize-none h-20"
          />
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || selectedFiles.size === 0}
            className="w-full py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Commit {selectedFiles.size > 0 && `(${selectedFiles.size})`}
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handlePush}
            className="flex-1 py-2 flex items-center justify-center gap-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
          >
            <Upload className="h-4 w-4" />
            Push
          </button>
          <button
            onClick={handlePull}
            className="flex-1 py-2 flex items-center justify-center gap-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
          >
            <Download className="h-4 w-4" />
            Pull
          </button>
        </div>
      </div>

      {/* Right Panel - History */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Version Control</h2>
          <div className="flex items-center gap-2 text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{currentBranch}</span>
          </div>
          {currentProjectPath && (
            <p className="text-sm text-muted-foreground mt-2">
              Project: <code className="bg-muted px-1 rounded">{currentProjectPath}</code>
            </p>
          )}
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Branches</h3>
          <div className="flex flex-wrap gap-2">
            {branches.filter(b => !b.is_remote).map((branch) => (
              <button
                key={branch.name}
                onClick={() => handleSwitchBranch(branch.name)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  branch.is_current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {branch.name}
              </button>
            ))}
            <button 
              onClick={() => setShowNewBranchDialog(true)}
              className="px-3 py-1 rounded-md text-sm border border-dashed hover:bg-accent flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              New Branch
            </button>
          </div>
          
          {branches.some(b => b.is_remote) && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground mb-2">Remote branches:</p>
              <div className="flex flex-wrap gap-2">
                {branches.filter(b => b.is_remote).map((branch) => (
                  <span
                    key={branch.name}
                    className="px-3 py-1 rounded-md text-sm bg-muted text-muted-foreground"
                  >
                    origin/{branch.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Commit History</h3>
          {commits.length === 0 ? (
            <p className="text-muted-foreground">No commits yet</p>
          ) : (
            <div className="space-y-3">
              {commits.map((commit) => (
                <div key={commit.sha} className="p-4 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <code className="text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</code>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(commit.date)}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">by {commit.author}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Branch Dialog */}
      {showNewBranchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-semibold mb-4">Create New Branch</h3>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="Branch name..."
              className="w-full p-2 border rounded-md bg-background mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBranch();
                if (e.key === 'Escape') setShowNewBranchDialog(false);
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Create Branch
              </button>
              <button
                onClick={() => setShowNewBranchDialog(false)}
                className="flex-1 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Viewer */}
      {showDiff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-4/5 h-4/5 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {selectedFile ? `Diff: ${selectedFile}` : 'All Changes'}
              </h3>
              <button
                onClick={() => setShowDiff(false)}
                className="p-1 hover:bg-accent rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor
                value={diffContent}
                language="diff"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 