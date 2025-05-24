import { GitStatus } from '../../store/gitStore'
import { FileText, FilePlus, FileX, Check } from 'lucide-react'
import clsx from 'clsx'

interface ChangedFilesProps {
  status: GitStatus | null
  selectedFiles: Set<string>
  onFileToggle: (file: string) => void
}

function ChangedFiles({ status, selectedFiles, onFileToggle }: ChangedFilesProps) {
  if (!status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading status...</p>
      </div>
    )
  }

  const allFiles = [
    ...status.modified.map(f => ({ file: f, type: 'modified' as const })),
    ...status.untracked.map(f => ({ file: f, type: 'untracked' as const })),
    ...status.deleted.map(f => ({ file: f, type: 'deleted' as const })),
  ]

  if (allFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No changes</p>
      </div>
    )
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'modified':
        return FileText
      case 'untracked':
        return FilePlus
      case 'deleted':
        return FileX
      default:
        return FileText
    }
  }

  const getColor = (type: string) => {
    switch (type) {
      case 'modified':
        return 'text-amber-500'
      case 'untracked':
        return 'text-green-500'
      case 'deleted':
        return 'text-red-500'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {allFiles.map(({ file, type }) => {
        const Icon = getIcon(type)
        const isSelected = selectedFiles.has(file)
        
        return (
          <div
            key={file}
            onClick={() => onFileToggle(file)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors',
              'hover:bg-accent/50',
              isSelected && 'bg-accent'
            )}
          >
            <div className="flex items-center justify-center w-4 h-4 border rounded">
              {isSelected && <Check className="w-3 h-3" />}
            </div>
            
            <Icon className={clsx('w-4 h-4', getColor(type))} />
            
            <span className="text-sm truncate flex-1">{file}</span>
            
            <span className={clsx('text-xs uppercase', getColor(type))}>
              {type[0]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default ChangedFiles 