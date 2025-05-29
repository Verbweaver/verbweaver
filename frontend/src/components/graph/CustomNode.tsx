import { memo } from 'react'
import { Handle, Position } from 'react-flow-renderer'
import { NODE_TYPES } from '@verbweaver/shared'
import { FileText, User, MapPin, CheckCircle, Package, Folder, FolderOpen } from 'lucide-react'
import clsx from 'clsx'

interface CustomNodeProps {
  data: {
    label: string
    type: string
    metadata?: any
    isDirectory?: boolean
  }
  selected?: boolean
}

const getIcon = (type: string, isDirectory?: boolean) => {
  // Check if it's a directory/folder first
  if (isDirectory || type === 'folder') {
    return FolderOpen
  }
  
  switch (type) {
    case NODE_TYPES.CHAPTER:
      return FileText
    case NODE_TYPES.CHARACTER:
      return User
    case NODE_TYPES.LOCATION:
      return MapPin
    case NODE_TYPES.TASK:
      return CheckCircle
    case NODE_TYPES.DIRECTORY:
      return FolderOpen
    default:
      return FileText
  }
}

const getNodeColor = (type: string, isDirectory?: boolean) => {
  // Check if it's a directory/folder first
  if (isDirectory || type === 'folder') {
    return 'bg-amber-600'
  }
  
  switch (type) {
    case NODE_TYPES.CHAPTER:
      return 'bg-blue-500'
    case NODE_TYPES.CHARACTER:
      return 'bg-green-500'
    case NODE_TYPES.LOCATION:
      return 'bg-amber-500'
    case NODE_TYPES.TASK:
      return 'bg-purple-500'
    case NODE_TYPES.DIRECTORY:
      return 'bg-amber-600'
    default:
      return 'bg-gray-400'
  }
}

function CustomNode({ data, selected }: CustomNodeProps) {
  const Icon = getIcon(data.type, data.isDirectory)
  const colorClass = getNodeColor(data.type, data.isDirectory)

  return (
    <div
      className={clsx(
        'px-4 py-2 shadow-md rounded-md border-2 bg-background',
        selected ? 'border-primary' : 'border-border',
        'hover:shadow-lg transition-shadow'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary"
      />
      
      <div className="flex items-center gap-2">
        <div className={clsx('p-1 rounded', colorClass)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="text-sm font-medium">{data.label}</div>
      </div>
      
      {data.metadata?.tags && data.metadata.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {data.metadata.tags.slice(0, 3).map((tag: string, index: number) => (
            <span
              key={index}
              className="text-xs px-1.5 py-0.5 bg-muted rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary"
      />
    </div>
  )
}

export default memo(CustomNode) 