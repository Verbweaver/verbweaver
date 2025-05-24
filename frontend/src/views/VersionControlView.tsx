import { useState, useEffect } from 'react';
import { GitBranch, GitCommit, Plus, RefreshCw, Upload, Download } from 'lucide-react';
import { api } from '../services/auth';

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
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadGitStatus();
  }, []);

  const loadGitStatus = async () => {
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
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || selectedFiles.size === 0) return;

    try {
      await api.post('/git/commit', {
        message: commitMessage,
        files: Array.from(selectedFiles)
      });
      setCommitMessage('');
      setSelectedFiles(new Set());
      await loadGitStatus();
    } catch (error) {
      console.error('Failed to commit:', error);
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
      await api.post('/git/push');
      alert('Successfully pushed to remote');
    } catch (error) {
      console.error('Failed to push:', error);
      alert('Failed to push changes');
    }
  };

  const handlePull = async () => {
    try {
      await api.post('/git/pull');
      await loadGitStatus();
      alert('Successfully pulled from remote');
    } catch (error) {
      console.error('Failed to pull:', error);
      alert('Failed to pull changes');
    }
  };

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