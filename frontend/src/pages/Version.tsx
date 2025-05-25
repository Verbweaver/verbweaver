import { useState, useEffect } from 'react';
import { GitBranch, GitCommit, Plus, RefreshCw, Upload, Download } from 'lucide-react';
import { api } from '../services/auth';
import { useProjectStore } from '../store/projectStore';
import toast from 'react-hot-toast';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface Branch {
  name: string;
  is_current: boolean;
}

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export default function VersionControlView() {
  const { currentProject, currentProjectPath } = useProjectStore();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentProject) {
      loadGitStatus();
    }
  }, [currentProject]);

  const loadGitStatus = async () => {
    if (isElectron && currentProjectPath && window.electronAPI) {
      // For Electron, use actual Git commands
      setIsLoading(true);
      try {
        const status = await window.electronAPI.gitStatus(currentProjectPath);
        setChanges(status.changes || []);
        setBranches([{ name: 'main', is_current: true }]); // TODO: Get actual branches
        setCommits([]); // TODO: Get actual commits
      } catch (error) {
        console.error('Failed to load git status:', error);
        // If git is not initialized, show appropriate message
        setChanges([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!isElectron) {
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
      } else {
        await api.post('/git/commit', {
          message: commitMessage,
          files: Array.from(selectedFiles)
        });
        setCommitMessage('');
        setSelectedFiles(new Set());
        await loadGitStatus();
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
      } else {
        await api.post('/git/push');
        alert('Successfully pushed to remote');
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
      } else {
        await api.post('/git/pull');
        await loadGitStatus();
        alert('Successfully pulled from remote');
      }
    } catch (error) {
      console.error('Failed to pull:', error);
      toast.error('Failed to pull changes. Make sure you have a remote configured.');
    }
  };

  if (!currentProject) {
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

  if (isElectron) {
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
                <label
                  key={change.path}
                  className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
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
                </label>
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

        {/* Right Panel - Info */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Version Control</h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              <span>{currentBranch}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Project: <code className="bg-muted px-1 rounded">{currentProjectPath}</code>
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              Git Integration Active
            </h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              You can now use the Git features in Verbweaver to manage your version control.
              Make sure your project has a Git repository initialized.
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
              Note: Advanced features like branch management and commit history are coming soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left Panel - Changes */}
      <div className="w-80 border-r bg-background p-4 overflow-y-auto">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Changes</h3>
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
              <label
                key={change.path}
                className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
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
              </label>
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
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Branches</h3>
          <div className="flex flex-wrap gap-2">
            {branches.map((branch) => (
              <button
                key={branch.name}
                className={`px-3 py-1 rounded-md text-sm ${
                  branch.is_current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {branch.name}
              </button>
            ))}
            <button className="px-3 py-1 rounded-md text-sm border border-dashed hover:bg-accent">
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Commit History</h3>
          {commits.length === 0 ? (
            <p className="text-muted-foreground">No commits yet</p>
          ) : (
            <div className="space-y-3">
              {commits.map((commit) => (
                <div key={commit.sha} className="p-4 bg-card rounded-lg border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <code className="text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</code>
                    </div>
                    <span className="text-xs text-muted-foreground">{commit.date}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">by {commit.author}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 