import { GitCommit } from '../../store/gitStore'
import { GitCommit as GitCommitIcon, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface CommitHistoryProps {
  commits: GitCommit[]
  isLoading: boolean
}

function CommitHistory({ commits, isLoading }: CommitHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading commits...</p>
      </div>
    )
  }

  if (commits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <GitCommitIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No commits yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {commits.map((commit) => (
        <div
          key={commit.hash}
          className="px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm mb-1 line-clamp-2">
                {commit.message}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>{commit.author}</span>
                </div>
                <span>•</span>
                <span title={new Date(commit.date).toLocaleString()}>
                  {formatDistanceToNow(new Date(commit.date), { addSuffix: true })}
                </span>
              </div>
            </div>
            
            <code className="text-xs font-mono text-muted-foreground">
              {commit.hash.substring(0, 7)}
            </code>
          </div>
        </div>
      ))}
    </div>
  )
}

export default CommitHistory 